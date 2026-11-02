import { sql } from '../../../db/src/client.js';
import { type Actor } from '../contracts.js';
import { listScoped } from '../work.js';
import { brainScope, canManage, validateTarget } from './access.js';
import { searchBrain } from './retrieval.js';
import { brainInbox } from './capture.js';
import { type EntityType } from './schemas.js';
import { listEntities } from './entities.js';
export async function entityDetail(
  actor: Actor,
  type: EntityType,
  workspace: string,
  id: string,
) {
  await brainScope(sql, actor, workspace);
  const { row } = await validateTarget(sql, actor, workspace, type, id);
  const filter = { workspace_id: workspace, [type + '_id']: id, limit: 100 };
  const memory = await searchBrain(actor, filter);
  const relationships =
    await sql`SELECT * FROM entity_links WHERE workspace_id=${workspace} AND ((from_type=${type} AND from_id=${id}) OR (to_type=${type} AND to_id=${id})) ORDER BY created_at DESC LIMIT 100`;
  const [tasks, messages, artifacts, runs] = await Promise.all([
    listScoped(actor, 'tasks', { workspace, limit: 200 }),
    sql`SELECT m.id,m.channel_id,m.body,m.created_at FROM messages m JOIN channels c ON c.id=m.channel_id WHERE m.workspace_id=${workspace}
  AND (${actor.type === 'user'} OR EXISTS(SELECT 1 FROM agent_permissions WHERE agent_id=${actor.id} AND workspace_id=${workspace} AND permission='messages.read'))
  AND (c.channel_type NOT IN ('private','direct') OR EXISTS(SELECT 1 FROM channel_members WHERE channel_id=c.id AND member_type=${actor.type} AND member_id=${actor.id}))
  AND EXISTS(SELECT 1 FROM brain_links source JOIN brain_links entity ON entity.brain_item_id=source.brain_item_id WHERE source.target_type='message' AND source.target_id=m.id AND entity.target_type=${type} AND entity.target_id=${id}) ORDER BY m.created_at DESC LIMIT 30`,
    listScoped(actor, 'artifacts', { workspace, limit: 200 }),
    listScoped(actor, 'runs', { workspace, limit: 200 }),
  ]);
  const relatedIds = new Set(
    relationships.map((r) => (r.from_id === id ? r.to_id : r.from_id)),
  );
  const links = memory.items.flatMap((m) => m.links as { target_id: string }[]);
  for (const l of links) relatedIds.add(l.target_id);
  const relatedTasks = tasks.filter((t) => relatedIds.has(t.id));
  const taskIds = new Set(relatedTasks.map((t) => t.id));
  const relatedRuns = runs.filter(
    (r) => relatedIds.has(r.id) || taskIds.has(r.task_id),
  );
  const activity =
    await sql`SELECT id,action,actor_type,actor_id,created_at,payload FROM events WHERE workspace_id=${workspace} AND (payload->>'entity_id'=${id} OR payload->>'brain_item_id'=ANY(${memory.items.map((m) => m.id)}::text[])) ORDER BY id DESC LIMIT 40`;
  const [people, projects, organizations] = await Promise.all([
    listEntities(actor, 'person', workspace),
    listEntities(actor, 'project', workspace),
    listEntities(actor, 'organization', workspace),
  ]);
  return {
    ...row,
    memories: memory.items,
    decisions: memory.items.filter((m) => m.kind === 'decision'),
    relationships,
    people: people.filter((p) => relatedIds.has(p.id)),
    projects: projects.filter((p) => relatedIds.has(p.id)),
    organizations: organizations.filter((o) => relatedIds.has(o.id)),
    tasks: relatedTasks,
    messages,
    artifacts: artifacts.filter(
      (a) => relatedIds.has(a.id) || taskIds.has(a.task_id),
    ),
    runs: relatedRuns,
    activity,
  };
}
export async function todayOverview(actor: Actor, workspace: string) {
  await brainScope(sql, actor, workspace);
  const [tasks, approvals, runs, memories, decisions, projects, inbox] =
    await Promise.all([
      listScoped(actor, 'tasks', { workspace }),
      listScoped(actor, 'approvals', { workspace, status: 'pending' }),
      listScoped(actor, 'runs', { workspace }),
      searchBrain(actor, { workspace_id: workspace, limit: 8 }),
      searchBrain(actor, {
        workspace_id: workspace,
        kind: 'decision',
        limit: 5,
      }),
      listEntities(actor, 'project', workspace),
      canManage(actor)
        ? brainInbox(actor, workspace)
        : Promise.resolve({ captures: [], proposals: [] }),
    ]);
  const captures = canManage(actor)
    ? await sql`SELECT id,status,created_at,left(raw_text,240) AS excerpt,sensitive FROM capture_inbox WHERE workspace_id=${workspace} ORDER BY created_at DESC LIMIT 8`
    : [];
  return {
    approvals,
    inbox_count: inbox.captures.length + inbox.proposals.length,
    follow_ups: tasks.filter(
      (t) =>
        !['completed', 'cancelled'].includes(t.status) &&
        (t.due_at || t.description.startsWith('From capture ')),
    ),
    working: runs.filter((r) => r.status === 'running'),
    completed: tasks.filter((t) => t.status === 'completed').slice(0, 8),
    memories: memories.items,
    decisions: decisions.items,
    captures,
    projects: projects.slice(0, 8),
  };
}
