import { sql } from '../../db/src/client.js';
import {
  type Actor,
  approvalInput,
  fail,
  pipelineSchema,
} from './contracts.js';
import { audit, authorize } from './security.js';
import { scopedRow } from './work.js';
import { postHash } from './state.js';
export async function requestApproval(actor: Actor, input: unknown) {
  const data = approvalInput.parse(input);
  return sql.begin(async (tx) => {
    await authorize(tx, actor, 'approvals.request', {
      workspace: data.workspace_id,
    });
    const agent =
      actor.type === 'agent' ? actor.id : data.requested_by_agent_id;
    if (!agent)
      fail(422, 'agent_required', 'Select the agent requesting approval.');
    const [permitted] =
      await tx`SELECT 1 FROM agent_permissions WHERE agent_id=${agent!} AND workspace_id=${data.workspace_id} AND permission='approvals.request'`;
    if (!permitted)
      fail(
        403,
        'forbidden',
        'Requesting agent has no approval access to this workspace.',
      );
    if (data.task_id) {
      const task = await scopedRow(
        tx,
        actor,
        'tasks',
        data.task_id,
        'tasks.read',
      );
      if (task.workspace_id !== data.workspace_id)
        fail(422, 'workspace_mismatch', 'Task belongs to another workspace.');
      if (actor.type === 'agent' && task.assigned_agent_id !== actor.id)
        fail(403, 'forbidden', 'Approval must relate to your assigned task.');
    }
    if (data.run_id) {
      const run = await scopedRow(
        tx,
        actor,
        'runs',
        data.run_id,
        'workspace.read',
      );
      if (
        run.workspace_id !== data.workspace_id ||
        run.task_id !== (data.task_id ?? null) ||
        (actor.type === 'agent' && run.agent_id !== actor.id)
      )
        fail(422, 'run_mismatch', 'Run does not match this request.');
    }
    let payload = data.payload;
    if (data.approval_type === 'content.publish') {
      const [ns] =
        await tx`SELECT * FROM namespaces WHERE id='vlyntro-ig' AND workspace_id=${data.workspace_id}`;
      if (!ns)
        fail(
          422,
          'workspace_mismatch',
          'Instagram namespace belongs to another workspace.',
        );
      const [document] =
        await tx`SELECT value FROM documents WHERE namespace_id='vlyntro-ig' AND key='pipeline' FOR UPDATE`;
      const post = pipelineSchema
        .parse(document.value)
        .posts.find((p) => p.id === data.payload.post_id);
      if (!post || post.status !== 'in_review')
        fail(
          409,
          'review_required',
          'The content must be in review before approval.',
        );
      const [muse] = await tx`SELECT slug FROM agents WHERE id=${agent!}`;
      if (muse?.slug !== 'muse')
        fail(
          403,
          'reviewer_required',
          'Muse must request publication approval.',
        );
      payload = {
        namespace: 'vlyntro-ig',
        key: 'pipeline',
        post_id: post.id,
        content_hash: postHash(post),
        caption: post.caption,
        media_refs: post.media_refs,
      };
    }
    const [approval] =
      await tx`INSERT INTO approvals(workspace_id,task_id,run_id,requested_by_agent_id,approval_type,title,description,payload)
   VALUES(${data.workspace_id},${data.task_id ?? null},${data.run_id ?? null},${agent!},${data.approval_type},${data.title},${data.description},${tx.json(payload)}) RETURNING *`;
    if (data.task_id) {
      await tx`UPDATE tasks SET status='needs_approval',updated_at=now() WHERE id=${data.task_id}`;
      await tx`UPDATE jobs SET status='waiting',updated_at=now() WHERE task_id=${data.task_id} AND status='queued'`;
    }
    await audit(
      tx,
      actor,
      'approval.created',
      { workspace: data.workspace_id },
      { approval_id: approval.id, task_id: data.task_id ?? null },
    );
    return approval;
  });
}
export async function resolveApproval(
  actor: Actor,
  id: string,
  decision: 'approved' | 'rejected',
  comment = '',
) {
  if (actor.type !== 'user' || !['owner', 'admin'].includes(actor.role ?? ''))
    fail(
      403,
      'human_required',
      'Only an authorized human may resolve approvals.',
    );
  return sql.begin(async (tx) => {
    const [approval] =
      await tx`SELECT * FROM approvals WHERE id::text=${id} FOR UPDATE`;
    if (!approval) return fail(404, 'not_found', 'Approval not found.');
    if (approval.status !== 'pending') {
      if (approval.status === decision) return approval;
      fail(409, 'already_resolved', 'This approval has already been resolved.');
    }
    if (
      approval.approval_type === 'content.publish' &&
      decision === 'approved'
    ) {
      const namespace = 'vlyntro-ig',
        key = 'pipeline';
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${namespace + ':' + key},0))`;
      const [document] =
        await tx`SELECT * FROM documents WHERE namespace_id=${namespace} AND key=${key} FOR UPDATE`;
      const value = pipelineSchema.parse(document.value);
      const post = value.posts.find((p) => p.id === approval.payload.post_id);
      if (
        !post ||
        post.status !== 'in_review' ||
        postHash(post) !== approval.payload.content_hash
      )
        fail(
          409,
          'content_changed',
          'Content changed after review. Request a fresh approval.',
        );
      post.status = 'approved';
      await tx`UPDATE documents SET value=${tx.json(value)},version=version+1,updated_by=${'user:' + actor.id},updated_at=now() WHERE namespace_id=${namespace} AND key=${key}`;
      await audit(
        tx,
        actor,
        'document.updated',
        { workspace: approval.workspace_id, namespace, key },
        { version: document.version + 1, approval_id: id },
      );
    }
    const [result] =
      await tx`UPDATE approvals SET status=${decision},reviewed_by_user_id=${actor.id},review_comment=${comment},reviewed_at=now() WHERE id=${id} RETURNING *`;
    if (approval.task_id) {
      const [pending] =
        await tx`SELECT 1 FROM approvals WHERE task_id=${approval.task_id} AND status='pending' AND id<>${id}`;
      if (!pending) {
        await tx`UPDATE tasks SET status=${decision === 'approved' ? 'queued' : 'blocked'},updated_at=now() WHERE id=${approval.task_id}`;
        if (decision === 'approved') {
          await tx`UPDATE jobs SET status='queued',available_at=now(),updated_at=now() WHERE task_id=${approval.task_id} AND status='waiting'`;
          await tx`INSERT INTO jobs(workspace_id,task_id,agent_id,job_type,payload,idempotency_key)
      VALUES(${approval.workspace_id},${approval.task_id},${approval.requested_by_agent_id},'approval.resume',${tx.json({ instruction: 'Human approved this action. Record the approved action. Do not publish externally. Approval ID: ' + id, approval_id: id, depth: 0 })},${'approval:' + id}) ON CONFLICT DO NOTHING`;
        } else
          await tx`UPDATE jobs SET status='cancelled',updated_at=now() WHERE task_id=${approval.task_id} AND status='waiting'`;
      }
    }
    await audit(
      tx,
      actor,
      'approval.resolved',
      { workspace: approval.workspace_id },
      { approval_id: id, status: decision, task_id: approval.task_id },
    );
    return result;
  });
}
