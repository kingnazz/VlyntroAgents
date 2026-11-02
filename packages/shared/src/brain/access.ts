import { sql, type Query } from '../../../db/src/client.js';
import { type Actor, fail } from '../contracts.js';
import { authorize } from '../security.js';
import { channelInfo, scopedRow } from '../work.js';
import { entityTables } from './schemas.js';
export const canManage = (actor: Actor) =>
  actor.type === 'user' && ['owner', 'admin'].includes(actor.role ?? '');
export async function brainScope(
  db: Query,
  actor: Actor,
  workspace: string,
  permission = 'brain.read',
) {
  await authorize(db, actor, permission, { workspace });
  const [row] = await db`SELECT id FROM workspaces WHERE id=${workspace}`;
  if (!row) fail(404, 'not_found', 'Workspace not found.');
}
export async function humanManager(db: Query, actor: Actor, workspace: string) {
  if (!canManage(actor))
    fail(
      403,
      'human_required',
      'A human owner or administrator must review this change.',
    );
  await brainScope(db, actor, workspace, 'brain.manage');
}
export function visibleMemory(db: Query, actor: Actor) {
  // Alias b is used by every retrieval query. Retain restrictions even if a source link is later unlinked.
  return db`(b.sensitive=false OR ${canManage(actor)}) AND NOT EXISTS (
 SELECT 1 FROM unnest(b.restricted_channel_ids) cid
 WHERE NOT EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id=cid AND cm.member_type=${actor.type} AND cm.member_id=${actor.id}))
 AND (${actor.type === 'user'} OR NOT EXISTS(SELECT 1 FROM brain_links bl WHERE bl.brain_item_id=b.id AND bl.target_type IN ('message','channel','task','run','artifact','approval')
 AND NOT EXISTS(SELECT 1 FROM agent_permissions ap WHERE ap.agent_id=${actor.id} AND ap.workspace_id=b.workspace_id AND ap.namespace_id IS NULL AND ap.permission=CASE WHEN bl.target_type IN ('message','channel') THEN 'messages.read' WHEN bl.target_type='task' THEN 'tasks.read' ELSE 'workspace.read' END)))`;
}
export async function memoryRow(
  db: Query,
  actor: Actor,
  workspace: string,
  id: string,
  lock = false,
) {
  await brainScope(db, actor, workspace);
  const [row] =
    await db`SELECT b.* FROM brain_items b WHERE b.id=${id} AND b.workspace_id=${workspace} AND ${visibleMemory(db, actor)} ${lock ? db`FOR UPDATE` : db``}`;
  if (!row)
    return fail(404, 'not_found', 'Memory not found in this workspace.');
  return row;
}
export async function validateTarget(
  db: Query,
  actor: Actor,
  workspace: string,
  type: string,
  id: string,
) {
  let row;
  let channel: string | null = null;
  const sourceChannels = new Set<string>();
  if (type in entityTables) {
    [row] =
      await db`SELECT * FROM ${db(entityTables[type as keyof typeof entityTables])} WHERE id=${id} AND workspace_id=${workspace}`;
  } else if (type === 'message' || type === 'channel') {
    if (type === 'message')
      [row] =
        await db`SELECT * FROM messages WHERE id=${id} AND workspace_id=${workspace}`;
    else
      [row] =
        await db`SELECT * FROM channels WHERE id=${id} AND workspace_id=${workspace}`;
    if (row) channel = type === 'message' ? row.channel_id : row.id;
  } else if (['task', 'run', 'artifact', 'approval'].includes(type)) {
    row = await scopedRow(
      db,
      actor,
      (
        {
          task: 'tasks',
          run: 'runs',
          artifact: 'artifacts',
          approval: 'approvals',
        } as const
      )[type as 'task' | 'run' | 'artifact' | 'approval'],
      id,
      type === 'task' ? 'tasks.read' : 'workspace.read',
    );
    channel = row.channel_id ?? null;
    if (channel) sourceChannels.add(channel);
    if (row.task_id) {
      const [t] =
        await db`SELECT channel_id FROM tasks WHERE id=${row.task_id} AND workspace_id=${workspace}`;
      channel = t?.channel_id ?? null;
      if (channel) sourceChannels.add(channel);
    }
    if (type === 'artifact' && row.message_id) {
      const [m] =
        await db`SELECT channel_id FROM messages WHERE id=${row.message_id} AND workspace_id=${workspace}`;
      channel = m?.channel_id ?? channel;
    }
    if (row.job_id) {
      const [job] =
        await db`SELECT payload->>'channel_id' AS channel_id FROM jobs WHERE id=${row.job_id} AND workspace_id=${workspace}`;
      if (job?.channel_id) sourceChannels.add(job.channel_id);
    }
  }
  if (!row || row.workspace_id !== workspace)
    fail(
      422,
      'invalid_target',
      'Related record does not exist in this workspace.',
    );
  if (channel) sourceChannels.add(channel);
  const restricted_channels: string[] = [];
  for (const sourceChannel of sourceChannels) {
    const c = await channelInfo(db, actor, sourceChannel, 'messages.read');
    if (['private', 'direct'].includes(c.channel_type))
      restricted_channels.push(sourceChannel);
  }
  return { row, restricted_channels };
}
export async function captureRow(
  db: Query,
  actor: Actor,
  workspace: string,
  id: string,
  lock = false,
) {
  await humanManager(db, actor, workspace);
  const [row] =
    await db`SELECT * FROM capture_inbox WHERE id=${id} AND workspace_id=${workspace} ${lock ? db`FOR UPDATE` : db``}`;
  if (!row) return fail(404, 'not_found', 'Capture not found.');
  return row;
}
export async function actorName(actor: Actor) {
  const [row] =
    actor.type === 'user'
      ? await sql`SELECT display_name FROM users WHERE id=${actor.id}`
      : await sql`SELECT display_name FROM agents WHERE id=${actor.id}`;
  return row?.display_name ?? actor.type;
}
