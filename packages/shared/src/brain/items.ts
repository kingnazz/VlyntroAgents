import { sql, type Query } from '../../../db/src/client.js';
import { type Actor, fail } from '../contracts.js';
import { audit, authorize } from '../security.js';
import { itemInput, itemPatch, linkInput } from './schemas.js';
import {
  brainScope,
  canManage,
  captureRow,
  humanManager,
  memoryRow,
  validateTarget,
} from './access.js';
import { z } from 'zod';

export function containsSecret(text: string) {
  if (
    Object.entries(process.env).some(
      ([key, value]) =>
        /KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL/.test(key) &&
        value &&
        value.length >= 8 &&
        text.includes(value),
    )
  )
    return true;
  return /(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:postgres(?:ql)?|mysql):\/\/[^\s]+:[^\s]+@|\b(?:password|api[_ -]?key|session[_ -]?token|secret|bearer)\s*[:= ]\s*\S{8,})/i.test(
    text,
  );
}
const reservedMetadata = [
  'confirmed_by',
  'confirmed_at',
  'capture_id',
  'run_id',
  'evidence',
];
function cleanMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !reservedMetadata.includes(key)),
  );
}
async function snapshot(
  db: Query,
  actor: Actor,
  item: Record<string, unknown>,
  reason?: string,
) {
  const { search_vector: _vector, ...record } = item;
  void _vector;
  const links =
    await db`SELECT target_type,target_id,relation FROM brain_links WHERE brain_item_id=${String(item.id)} ORDER BY created_at,id`;
  await db`INSERT INTO brain_revisions(brain_item_id,revision_number,snapshot,changed_by_type,changed_by_id,change_reason) VALUES(${String(item.id)},${Number(item.revision_number)},${db.json({ ...record, links } as never)},${actor.type},${actor.id},${reason ?? null})`;
}
export async function createMemoryInTx(
  db: Query,
  actor: Actor,
  input: unknown,
  lineage?: {
    id: string;
    restricted_channel_ids: string[];
    sensitive: boolean;
  },
) {
  const data = itemInput.parse(input);
  await brainScope(db, actor, data.workspace_id);
  const authoritative = ['decision', 'preference'].includes(data.kind);
  const status =
    actor.type === 'agent' && authoritative
      ? 'proposed'
      : (data.status ?? 'active');
  await authorize(
    db,
    actor,
    status === 'proposed' ? 'brain.propose' : 'brain.write',
    { workspace: data.workspace_id },
  );
  const sensitive =
    containsSecret(JSON.stringify(data)) || !!lineage?.sensitive;
  if (sensitive && !canManage(actor))
    fail(
      422,
      'sensitive_memory',
      'Secret-like content requires human review and cannot be contributed automatically.',
    );
  const links = [...data.links];
  if (data.source_type === 'capture') {
    if (!data.source_id)
      fail(422, 'source_required', 'Capture source is required.');
    // Internal extraction is separately authorized; public callers cannot borrow another source.
    const [capture] =
      await db`SELECT * FROM capture_inbox WHERE id=${data.source_id} AND workspace_id=${data.workspace_id}`;
    if (
      !capture ||
      capture.sensitive ||
      (actor.type === 'agent' && capture.processing_agent_id !== actor.id)
    )
      fail(
        403,
        'source_forbidden',
        'Capture source is unavailable for this actor.',
      );
  } else if (!['manual', 'agent'].includes(data.source_type)) {
    if (!data.source_id) fail(422, 'source_required', 'Source ID is required.');
    links.push({
      target_type: data.source_type,
      target_id: data.source_id,
      relation: 'SOURCE',
    } as z.infer<typeof linkInput>);
  }
  if (data.source_type === 'agent' && actor.type !== 'agent')
    fail(422, 'invalid_source', 'Agent attribution is assigned by the server.');
  const restricted: string[] = [...(lineage?.restricted_channel_ids ?? [])];
  for (const link of links) {
    const target = await validateTarget(
      db,
      actor,
      data.workspace_id,
      link.target_type,
      link.target_id,
    );
    restricted.push(...target.restricted_channels);
  }
  const [item] =
    await db`INSERT INTO brain_items(workspace_id,kind,title,body,summary,status,importance,confidence,occurred_at,valid_from,valid_until,source_type,source_id,created_by_type,created_by_id,metadata,sensitive,restricted_channel_ids,supersedes_id)
 VALUES(${data.workspace_id},${data.kind},${data.title},${data.body},${data.summary ?? null},${status},${data.importance},${data.confidence ?? null},${data.occurred_at ?? null},${data.valid_from ?? null},${data.valid_until ?? null},${data.source_type},${data.source_id ?? null},${actor.type},${actor.id},${db.json(cleanMetadata(data.metadata) as never)},${sensitive},${restricted},${lineage?.id ?? null}) RETURNING *`;
  for (const link of links)
    await db`INSERT INTO brain_links(brain_item_id,target_type,target_id,relation) VALUES(${item.id},${link.target_type},${link.target_id},${link.relation}) ON CONFLICT DO NOTHING`;
  await snapshot(db, actor, item, 'Created');
  await audit(
    db,
    actor,
    'brain.item.created',
    { workspace: data.workspace_id },
    { brain_item_id: item.id, kind: item.kind, status },
  );
  if (status === 'proposed')
    await audit(
      db,
      actor,
      'brain.inbox.created',
      { workspace: data.workspace_id },
      { brain_item_id: item.id },
    );
  return item;
}
export const createMemory = (actor: Actor, input: unknown) =>
  sql.begin((tx) => createMemoryInTx(tx, actor, input));
export async function sourceAttribution(
  actor: Actor,
  workspace: string,
  type: string,
  id: string | null,
) {
  if (!id || ['manual', 'agent'].includes(type)) return null;
  await brainScope(sql, actor, workspace);
  let row;
  if (type === 'capture')
    [row] =
      await sql`SELECT captured_by_type AS type,captured_by_id AS id FROM capture_inbox WHERE id=${id} AND workspace_id=${workspace} AND sensitive=false`;
  else {
    const target = await validateTarget(sql, actor, workspace, type, id);
    const r = target.row;
    row = {
      type:
        r.sender_type ?? r.created_by_type ?? (r.agent_id ? 'agent' : 'system'),
      id: r.sender_id ?? r.created_by_id ?? r.agent_id ?? null,
    };
  }
  if (!row) return null;
  const [author] =
    row.type === 'user'
      ? await sql`SELECT display_name FROM users WHERE id=${row.id}`
      : row.type === 'agent'
        ? await sql`SELECT display_name FROM agents WHERE id=${row.id}`
        : [];
  return { type: row.type, id: row.id, name: author?.display_name ?? 'System' };
}
export async function addMemoryLinkInTx(
  db: Query,
  actor: Actor,
  workspace: string,
  id: string,
  input: unknown,
) {
  await humanManager(db, actor, workspace);
  const old = await memoryRow(db, actor, workspace, id, true),
    link = linkInput.parse(input);
  const target = await validateTarget(
    db,
    actor,
    workspace,
    link.target_type,
    link.target_id,
  );
  const inserted =
    await db`INSERT INTO brain_links(brain_item_id,target_type,target_id,relation) VALUES(${id},${link.target_type},${link.target_id},${link.relation}) ON CONFLICT DO NOTHING RETURNING id`;
  if (!inserted.length) return;
  const restricted = [
    ...new Set([...old.restricted_channel_ids, ...target.restricted_channels]),
  ];
  const [item] =
    await db`UPDATE brain_items SET revision_number=revision_number+1,restricted_channel_ids=${restricted},updated_at=now() WHERE id=${id} RETURNING *`;
  await snapshot(db, actor, item, 'Linked reviewed entity');
  await audit(
    db,
    actor,
    'brain.item.updated',
    { workspace },
    { brain_item_id: id, fields: ['links'] },
  );
}
export async function readMemory(actor: Actor, workspace: string, id: string) {
  const item = await memoryRow(sql, actor, workspace, id);
  const [creator] =
    item.created_by_type === 'user'
      ? await sql`SELECT display_name FROM users WHERE id=${item.created_by_id}`
      : await sql`SELECT display_name FROM agents WHERE id=${item.created_by_id}`;
  const links =
    await sql`SELECT l.*,m.channel_id,coalesce(p.name,pe.display_name,o.name,t.title,c.name,a.name,'Source ' || l.target_type) AS title
 FROM brain_links l LEFT JOIN projects p ON l.target_type='project' AND p.id=l.target_id LEFT JOIN people pe ON l.target_type='person' AND pe.id=l.target_id LEFT JOIN organizations o ON l.target_type='organization' AND o.id=l.target_id LEFT JOIN tasks t ON l.target_type='task' AND t.id=l.target_id LEFT JOIN channels c ON l.target_type='channel' AND c.id=l.target_id LEFT JOIN artifacts a ON l.target_type='artifact' AND a.id=l.target_id LEFT JOIN messages m ON l.target_type='message' AND m.id=l.target_id WHERE l.brain_item_id=${id}`;
  let source = null;
  if (item.source_type === 'capture' && canManage(actor)) {
    const c = await captureRow(sql, actor, workspace, item.source_id);
    source = {
      id: c.id,
      raw_text: c.raw_text,
      captured_by_type: c.captured_by_type,
      captured_by_id: c.captured_by_id,
      created_at: c.created_at,
    };
  }
  return Object.assign(item, {
    author_name: creator?.display_name ?? item.created_by_type,
    links,
    source,
    source_attribution: await sourceAttribution(
      actor,
      workspace,
      item.source_type,
      item.source_id,
    ),
  });
}
export async function revisions(actor: Actor, workspace: string, id: string) {
  await memoryRow(sql, actor, workspace, id);
  // Old snapshots can contain content subsequently flagged sensitive; agents never receive history.
  await humanManager(sql, actor, workspace);
  return sql`SELECT * FROM brain_revisions WHERE brain_item_id=${id} ORDER BY revision_number DESC`;
}
export async function updateMemory(
  actor: Actor,
  workspace: string,
  id: string,
  input: unknown,
) {
  const { expected_revision, change_reason, links, ...data } =
    itemPatch.parse(input);
  return sql.begin(async (tx) => {
    const old = await memoryRow(tx, actor, workspace, id, true);
    await humanManager(tx, actor, workspace);
    if (old.revision_number !== expected_revision)
      fail(
        409,
        'revision_conflict',
        'This memory changed. Reload before editing.',
        { current_revision: old.revision_number },
      );
    if (!Object.keys(data).length && !links) return old;
    const restricted = new Set<string>(old.restricted_channel_ids);
    if (links) {
      for (const link of links) {
        const target = await validateTarget(
          tx,
          actor,
          workspace,
          link.target_type,
          link.target_id,
        );
        for (const channel of target.restricted_channels)
          restricted.add(channel);
      }
      await tx`DELETE FROM brain_links WHERE brain_item_id=${id} AND relation<>'SOURCE'`;
      for (const link of links)
        await tx`INSERT INTO brain_links(brain_item_id,target_type,target_id,relation) VALUES(${id},${link.target_type},${link.target_id},${link.relation}) ON CONFLICT DO NOTHING`;
    }
    const patch = {
      ...data,
      ...(data.metadata
        ? {
            metadata: tx.json({
              ...old.metadata,
              ...cleanMetadata(data.metadata),
            } as never),
          }
        : {}),
    };
    const sensitive = old.sensitive || containsSecret(JSON.stringify(data));
    const [item] =
      await tx`UPDATE brain_items SET ${tx({ ...patch, sensitive, restricted_channel_ids: [...restricted], revision_number: old.revision_number + 1 })},updated_at=now() WHERE id=${id} AND workspace_id=${workspace} RETURNING *`;
    await snapshot(tx, actor, item, change_reason ?? 'Edited');
    await audit(
      tx,
      actor,
      'brain.item.updated',
      { workspace },
      {
        brain_item_id: id,
        fields: [...Object.keys(data), ...(links ? ['links'] : [])],
      },
    );
    return item;
  });
}
export async function resolveMemory(
  actor: Actor,
  workspace: string,
  id: string,
  action: 'confirm' | 'archive',
  expected: number,
) {
  return sql.begin(async (tx) => {
    await humanManager(tx, actor, workspace);
    const old = await memoryRow(tx, actor, workspace, id, true);
    if (action === 'confirm' && old.status === 'active') return old;
    if (old.revision_number !== expected)
      fail(409, 'revision_conflict', 'Memory changed. Reload first.');
    if (action === 'confirm' && old.status !== 'proposed')
      fail(409, 'invalid_status', 'Only proposed memories can be confirmed.');
    const status = action === 'confirm' ? 'active' : 'archived';
    const metadata =
      action === 'confirm'
        ? {
            ...old.metadata,
            confirmed_by: actor.id,
            confirmed_at: new Date().toISOString(),
          }
        : old.metadata;
    const [item] =
      await tx`UPDATE brain_items SET status=${status},metadata=${tx.json(metadata)},revision_number=revision_number+1,updated_at=now() WHERE id=${id} RETURNING *`;
    await snapshot(
      tx,
      actor,
      item,
      action === 'confirm' ? 'Confirmed by human' : 'Archived',
    );
    await audit(
      tx,
      actor,
      'brain.item.updated',
      { workspace },
      { brain_item_id: id, status },
    );
    await audit(
      tx,
      actor,
      'brain.inbox.resolved',
      { workspace },
      { brain_item_id: id, resolution: action },
    );
    return item;
  });
}
export async function supersedeMemory(
  actor: Actor,
  workspace: string,
  id: string,
  input: unknown,
) {
  const { expected_revision, ...data } = itemInput
    .omit({ workspace_id: true, status: true })
    .extend({ expected_revision: z.number().int().positive() })
    .parse(input);
  return sql.begin(async (tx) => {
    await humanManager(tx, actor, workspace);
    const old = await memoryRow(tx, actor, workspace, id, true);
    if (
      old.revision_number !== expected_revision ||
      !['active', 'proposed'].includes(old.status)
    )
      fail(409, 'revision_conflict', 'Memory changed or is no longer current.');
    // Carry source confidentiality and links forward before taking the immutable initial snapshot.
    const previousLinks =
      await tx`SELECT target_type,target_id,relation FROM brain_links WHERE brain_item_id=${id}`;
    const newItem = await createMemoryInTx(
      tx,
      actor,
      {
        ...data,
        workspace_id: workspace,
        links: [...data.links, ...previousLinks],
      },
      {
        id,
        restricted_channel_ids: old.restricted_channel_ids,
        sensitive: old.sensitive,
      },
    );
    const [item] =
      await tx`UPDATE brain_items SET status='superseded',revision_number=revision_number+1,updated_at=now() WHERE id=${id} RETURNING *`;
    await snapshot(tx, actor, item, 'Superseded by ' + newItem.id);
    await audit(
      tx,
      actor,
      'brain.item.superseded',
      { workspace },
      { brain_item_id: id, replacement_id: newItem.id },
    );
    return Object.assign(newItem, { supersedes_id: id });
  });
}
