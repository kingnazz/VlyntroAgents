import { randomUUID } from 'node:crypto';
import { sql, type Query } from '../../db/src/client.js';
import {
  type Actor,
  fail,
  messageInput,
  taskInput,
  taskPatch,
} from './contracts.js';
import { authorize, audit } from './security.js';
export async function channelInfo(
  db: Query,
  actor: Actor,
  channel: string,
  permission: string,
) {
  const [row] =
    await db`SELECT * FROM channels WHERE id::text=${channel} OR slug=${channel} LIMIT 1`;
  if (!row) return fail(404, 'not_found', 'Channel not found.');
  await authorize(db, actor, permission, { workspace: row.workspace_id });
  if (['private', 'direct'].includes(row.channel_type)) {
    const [member] =
      await db`SELECT 1 FROM channel_members WHERE channel_id=${row.id} AND member_type=${actor.type} AND member_id=${actor.id}`;
    if (!member)
      fail(403, 'membership_required', 'This channel requires membership.');
  }
  return row;
}
export async function scopedRow(
  db: Query,
  actor: Actor,
  table: 'tasks' | 'runs' | 'approvals' | 'artifacts',
  id: string,
  permission: string,
) {
  const [row] = await db`SELECT * FROM ${db(table)} WHERE id::text=${id}`;
  if (!row) return fail(404, 'not_found', 'Record not found.');
  await authorize(db, actor, permission, { workspace: row.workspace_id });
  if (row.channel_id)
    await channelInfo(db, actor, row.channel_id, 'messages.read');
  if (row.task_id) {
    const [task] =
      await db`SELECT channel_id FROM tasks WHERE id=${row.task_id}`;
    if (task?.channel_id)
      await channelInfo(db, actor, task.channel_id, 'messages.read');
  }
  return row;
}
export async function listScoped(
  actor: Actor,
  table: 'tasks' | 'runs' | 'approvals' | 'artifacts' | 'channels',
  filter: {
    workspace?: string;
    status?: string;
    agent?: string;
    priority?: number;
    limit?: number;
    before?: string;
  } = {},
) {
  const permission =
    table === 'approvals' || table === 'artifacts' || table === 'runs'
      ? 'workspace.read'
      : table === 'channels'
        ? 'messages.read'
        : 'tasks.read';
  const rows =
    await sql`SELECT t.* FROM ${sql(table)} t JOIN workspaces w ON w.id=t.workspace_id WHERE
  (${filter.workspace ?? null}::text IS NULL OR w.slug=${filter.workspace ?? null} OR w.id::text=${filter.workspace ?? null})
  AND (${actor.type === 'user'} OR EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=${actor.id} AND p.workspace_id=t.workspace_id AND p.permission=${permission}))
  ${filter.status && table !== 'channels' && table !== 'artifacts' ? sql`AND t.status=${filter.status}` : sql``}
  ${filter.agent && table === 'tasks' ? sql`AND t.assigned_agent_id::text=${filter.agent}` : sql``}
  ${filter.priority !== undefined && table === 'tasks' ? sql`AND t.priority=${filter.priority}` : sql``}
  ${filter.before ? sql`AND t.id::text < ${filter.before}` : sql``}
  ${table === 'channels' ? sql`AND (t.channel_type NOT IN ('private','direct') OR EXISTS(SELECT 1 FROM channel_members m WHERE m.channel_id=t.id AND m.member_type=${actor.type} AND m.member_id=${actor.id}))` : sql``}
  ${table === 'tasks' ? sql`AND (t.channel_id IS NULL OR NOT EXISTS(SELECT 1 FROM channels c WHERE c.id=t.channel_id AND c.channel_type IN ('private','direct')) OR EXISTS(SELECT 1 FROM channel_members m WHERE m.channel_id=t.channel_id AND m.member_type=${actor.type} AND m.member_id=${actor.id}))` : sql``}
  ${['runs', 'approvals', 'artifacts'].includes(table) ? sql`AND (t.task_id IS NULL OR NOT EXISTS(SELECT 1 FROM tasks linked JOIN channels c ON c.id=linked.channel_id WHERE linked.id=t.task_id AND c.channel_type IN ('private','direct') AND NOT EXISTS(SELECT 1 FROM channel_members m WHERE m.channel_id=c.id AND m.member_type=${actor.type} AND m.member_id=${actor.id})))` : sql``}
  ORDER BY ${table === 'runs' ? sql`t.started_at` : sql`t.created_at`} DESC LIMIT ${Math.min(filter.limit ?? 100, 200)}`;
  if (actor.type === 'agent' && filter.workspace) {
    const [w] =
      await sql`SELECT id FROM workspaces WHERE slug=${filter.workspace} OR id::text=${filter.workspace}`;
    if (w) await authorize(sql, actor, permission, { workspace: w.id });
  }
  return rows;
}
export async function createTask(actor: Actor, input: unknown) {
  const data = taskInput.parse(input);
  return sql.begin((tx) => createTaskInTx(tx, actor, data));
}
export async function createTaskInTx(tx: Query, actor: Actor, input: unknown) {
  const data = taskInput.parse(input);
  await authorize(tx, actor, 'tasks.write', { workspace: data.workspace_id });
  if (data.channel_id) {
    const channel = await channelInfo(
      tx,
      actor,
      data.channel_id,
      'messages.read',
    );
    if (channel.workspace_id !== data.workspace_id)
      fail(422, 'workspace_mismatch', 'Channel belongs to another workspace.');
  }
  for (const id of [
    ...data.dependencies,
    ...(data.parent_task_id ? [data.parent_task_id] : []),
  ]) {
    const related = await scopedRow(tx, actor, 'tasks', id, 'tasks.read');
    if (related.workspace_id !== data.workspace_id)
      fail(
        422,
        'workspace_mismatch',
        'Related task belongs to another workspace.',
      );
  }
  if (data.assigned_agent_id)
    await validateAssignment(tx, data.assigned_agent_id, data.workspace_id);
  const [task] =
    await tx`INSERT INTO tasks(workspace_id,channel_id,title,description,status,priority,created_by_type,created_by_id,assigned_agent_id,parent_task_id,due_at)
   VALUES(${data.workspace_id},${data.channel_id ?? null},${data.title},${data.description},${data.assigned_agent_id ? 'queued' : 'backlog'},${data.priority},${actor.type},${actor.id},${data.assigned_agent_id ?? null},${data.parent_task_id ?? null},${data.due_at ?? null}) RETURNING *`;
  for (const id of data.dependencies)
    await tx`INSERT INTO task_dependencies(task_id,depends_on_task_id) VALUES(${task.id},${id})`;
  if (data.assigned_agent_id)
    await tx`INSERT INTO jobs(workspace_id,task_id,agent_id,job_type,payload,idempotency_key) VALUES(${data.workspace_id},${task.id},${data.assigned_agent_id},'task',${tx.json({ instruction: data.description || data.title, depth: 0 })},${'task:' + task.id})`;
  await audit(
    tx,
    actor,
    'task.created',
    { workspace: task.workspace_id },
    { task_id: task.id },
  );
  if (data.assigned_agent_id)
    await audit(
      tx,
      actor,
      'task.assigned',
      { workspace: task.workspace_id },
      { task_id: task.id, agent_id: data.assigned_agent_id },
    );
  return task;
}
async function validateAssignment(db: Query, agent: string, workspace: string) {
  const [row] =
    await db`SELECT id FROM agents WHERE id=${agent} AND status<>'disabled' AND EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=agents.id AND p.workspace_id=${workspace} AND p.permission='tasks.write')`;
  if (!row)
    fail(
      422,
      'invalid_agent',
      'Agent is disabled or has no access to this workspace.',
    );
}
export async function updateTask(actor: Actor, id: string, input: unknown) {
  const data = taskPatch.parse(input);
  return sql.begin(async (tx) => {
    const task = await scopedRow(tx, actor, 'tasks', id, 'tasks.write');
    if (actor.type === 'agent' && task.assigned_agent_id !== actor.id)
      fail(403, 'forbidden', 'Agents may update only their assigned tasks.');
    if (actor.type === 'agent' && data.assigned_agent_id !== undefined)
      fail(403, 'forbidden', 'Use a structured handoff to assign work.');
    const [pending] =
      await tx`SELECT 1 FROM approvals WHERE task_id=${id} AND status='pending'`;
    if (
      pending &&
      data.status &&
      data.status !== 'needs_approval' &&
      data.status !== 'cancelled'
    )
      fail(409, 'approval_pending', 'Resolve the pending approval first.');
    if (data.assigned_agent_id)
      await validateAssignment(tx, data.assigned_agent_id, task.workspace_id);
    if (!Object.keys(data).length) return task;
    const [result] =
      await tx`UPDATE tasks SET ${tx(data)},updated_at=now(),completed_at=${data.status === 'completed' ? (task.completed_at ?? new Date()) : data.status ? null : task.completed_at} WHERE id=${id} RETURNING *`;
    if (
      data.assigned_agent_id &&
      data.assigned_agent_id !== task.assigned_agent_id
    ) {
      await tx`UPDATE jobs SET status='cancelled',updated_at=now() WHERE task_id=${id} AND status IN ('queued','waiting')`;
      const [active] =
        await tx`SELECT 1 FROM jobs WHERE task_id=${id} AND status IN ('claimed','running')`;
      if (active)
        fail(409, 'job_running', 'Wait for the active job before reassigning.');
      await tx`INSERT INTO jobs(workspace_id,task_id,agent_id,job_type,payload) VALUES(${task.workspace_id},${id},${data.assigned_agent_id},'task',${tx.json({ instruction: result.description || result.title, depth: 0 })})`;
      await audit(
        tx,
        actor,
        'task.assigned',
        { workspace: task.workspace_id },
        { task_id: id, agent_id: data.assigned_agent_id },
      );
    }
    if (data.status === 'cancelled')
      await tx`UPDATE jobs SET status='cancelled' WHERE task_id=${id} AND status IN ('queued','waiting')`;
    await audit(
      tx,
      actor,
      'task.updated',
      { workspace: task.workspace_id },
      {
        task_id: id,
        fields: Object.keys(data),
        status: data.status ?? task.status,
      },
    );
    return result;
  });
}
export type RoutingContext = {
  rootId?: string;
  depth?: number;
  taskId?: string;
  runId?: string;
};
export async function postMessage(
  actor: Actor,
  channel: string,
  input: unknown,
  context: RoutingContext = {},
) {
  const data = messageInput.parse(input);
  return sql.begin(async (tx) => {
    const room = await channelInfo(tx, actor, channel, 'messages.write');
    const key = actor.type + ':' + actor.id + ':' + data.idempotency_key;
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
    const [existing] =
      await tx`SELECT * FROM messages WHERE idempotency_key=${key}`;
    if (existing) {
      if (existing.channel_id !== room.id || existing.body !== data.body)
        fail(
          409,
          'idempotency_conflict',
          'Idempotency key was used for different content.',
        );
      return existing;
    }
    const [message] =
      await tx`INSERT INTO messages(workspace_id,channel_id,sender_type,sender_id,body,metadata,idempotency_key)
   VALUES(${room.workspace_id},${room.id},${actor.type},${actor.id},${data.body},${tx.json({ task_id: context.taskId ?? null, run_id: context.runId ?? null })},${key}) RETURNING *`;
    await audit(
      tx,
      actor,
      'message.created',
      { workspace: room.workspace_id },
      { message_id: message.id, channel_id: room.id },
    );
    const mentions = [
      ...new Set(
        [...data.body.matchAll(/@([a-z][a-z0-9_-]*)\b/gi)].map((m) =>
          m[1].toLowerCase(),
        ),
      ),
    ].slice(0, actor.type === 'agent' ? 1 : 5);
    if (mentions.length) {
      const root = context.rootId ?? message.id;
      await tx`INSERT INTO routing_roots(id) VALUES(${root}) ON CONFLICT DO NOTHING`;
      const [budget] =
        await tx`SELECT * FROM routing_roots WHERE id=${root} FOR UPDATE`;
      for (const mention of mentions) {
        const [target] =
          await tx`SELECT a.* FROM agents a WHERE a.slug=${mention} AND a.agent_type<>'system' AND a.status<>'disabled'
     AND EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=a.id AND p.workspace_id=${room.workspace_id} AND p.permission='messages.write')`;
        if (!target) continue;
        if (['private', 'direct'].includes(room.channel_type)) {
          const [member] =
            await tx`SELECT 1 FROM channel_members WHERE channel_id=${room.id} AND member_type='agent' AND member_id=${target.id}`;
          if (!member) continue;
        }
        const depth = context.depth ?? 0;
        if (
          depth >= Number(process.env.AGENT_MAX_HANDOFF_DEPTH || 5) ||
          budget.job_count >= 20
        ) {
          if (context.taskId)
            await tx`UPDATE tasks SET status='blocked',updated_at=now() WHERE id=${context.taskId}`;
          await audit(
            tx,
            actor,
            'handoff.blocked',
            { workspace: room.workspace_id },
            {
              task_id: context.taskId ?? null,
              reason:
                'Automatic handoff limit reached. Human intervention required.',
            },
          );
          break;
        }
        let taskId = context.taskId;
        if (!taskId) {
          const [task] =
            await tx`INSERT INTO tasks(workspace_id,channel_id,title,description,status,created_by_type,created_by_id,assigned_agent_id)
      VALUES(${room.workspace_id},${room.id},${data.body.slice(0, 160)},${data.body},'queued',${actor.type},${actor.id},${target.id}) RETURNING id`;
          taskId = task.id;
          await audit(
            tx,
            actor,
            'task.created',
            { workspace: room.workspace_id },
            { task_id: taskId },
          );
        } else {
          await tx`UPDATE tasks SET assigned_agent_id=${target.id},status=CASE WHEN status IN ('needs_approval','blocked','cancelled') THEN status ELSE 'queued' END,updated_at=now() WHERE id=${taskId} AND workspace_id=${room.workspace_id}`;
          await audit(
            tx,
            actor,
            'task.assigned',
            { workspace: room.workspace_id },
            { task_id: taskId, agent_id: target.id },
          );
        }
        await tx`INSERT INTO jobs(workspace_id,task_id,agent_id,job_type,payload,root_id,idempotency_key)
     VALUES(${room.workspace_id},${taskId!},${target.id},'channel',${tx.json({ channel_id: room.id, message_id: message.id, instruction: data.body, depth: depth + 1 })},${root},${message.id + ':' + target.id}) ON CONFLICT(idempotency_key) DO NOTHING`;
        await tx`UPDATE routing_roots SET job_count=job_count+1 WHERE id=${root}`;
        budget.job_count++;
        await audit(
          tx,
          actor,
          'agent.handoff',
          { workspace: room.workspace_id },
          {
            message_id: message.id,
            task_id: taskId,
            agent_id: target.id,
            depth: depth + 1,
          },
        );
      }
    }
    return message;
  });
}
export const messageKey = () => randomUUID();
