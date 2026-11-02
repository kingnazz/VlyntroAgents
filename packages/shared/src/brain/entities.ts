import { sql, type Query } from '../../../db/src/client.js';
import { type Actor, fail } from '../contracts.js';
import { audit } from '../security.js';
import {
  brainScope,
  humanManager,
  validateTarget,
  visibleMemory,
} from './access.js';
import { listScoped } from '../work.js';
import {
  entityTables,
  entitySchemas,
  entityPatchSchemas,
  type EntityType,
  entityLinkInput,
} from './schemas.js';
export const normalizeEntity = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
export async function listEntities(
  actor: Actor,
  type: EntityType,
  workspace: string,
  q = '',
) {
  await brainScope(sql, actor, workspace);
  const name = type === 'person' ? 'display_name' : 'name';
  const text =
    type === 'project'
      ? sql`name || ' ' || coalesce(description,'') || ' ' || coalesce(summary,'')`
      : type === 'person'
        ? sql`display_name || ' ' || coalesce(organization_name,'') || ' ' || coalesce(notes,'')`
        : sql`name || ' ' || coalesce(description,'')`;
  const rows =
    await sql`SELECT * FROM ${sql(entityTables[type])} WHERE workspace_id=${workspace} AND (${q}='' OR ${sql(name)} ILIKE ${'%' + q + '%'} OR to_tsvector('english',${text}) @@ websearch_to_tsquery('english',${q})) ORDER BY CASE WHEN lower(${sql(name)})=lower(${q}) THEN 0 ELSE 1 END,updated_at DESC,id LIMIT 100`;
  if (type !== 'project' || !rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [memories, relationships, tasks] = await Promise.all([
    sql`SELECT b.id,b.title,b.kind,b.created_by_type,b.created_by_id,b.updated_at,l.target_id AS project_id,a.display_name AS agent_name,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',pe.id,'name',pe.display_name)) FROM brain_links pl JOIN people pe ON pl.target_type='person' AND pe.id=pl.target_id WHERE pl.brain_item_id=b.id),'[]'::jsonb) AS people
    FROM brain_items b JOIN brain_links l ON l.brain_item_id=b.id AND l.target_type='project' LEFT JOIN agents a ON b.created_by_type='agent' AND a.id=b.created_by_id
    WHERE b.workspace_id=${workspace} AND b.status='active' AND l.target_id=ANY(${ids}::uuid[]) AND ${visibleMemory(sql, actor)} ORDER BY b.updated_at DESC LIMIT 500`,
    sql`SELECT * FROM entity_links WHERE workspace_id=${workspace} AND ((from_type='project' AND from_id=ANY(${ids}::uuid[])) OR (to_type='project' AND to_id=ANY(${ids}::uuid[])))`,
    listScoped(actor, 'tasks', { workspace, limit: 200 }),
  ]);
  const taskIds = tasks
    .filter((t) => !['completed', 'cancelled'].includes(t.status))
    .map((t) => t.id);
  return rows.map((row) => {
    const related = memories.filter((m) => m.project_id === row.id);
    const relations = relationships.filter(
      (r) => r.from_id === row.id || r.to_id === row.id,
    );
    return Object.assign(row, {
      open_tasks: relations.filter(
        (r) => taskIds.includes(r.from_id) || taskIds.includes(r.to_id),
      ).length,
      related_people: [
        ...new Map(
          related
            .flatMap((m) => m.people as { id: string; name: string }[])
            .map((p) => [p.id, p.name]),
        ).values(),
      ],
      latest_decision:
        related.find((m) => m.kind === 'decision')?.title ?? null,
      latest_memory: related[0]?.title ?? null,
      recent_agents: [
        ...new Set(related.map((m) => m.agent_name).filter(Boolean)),
      ],
      last_activity: related[0]?.updated_at ?? row.updated_at,
    });
  });
}
export async function createEntityInTx(
  db: Query,
  actor: Actor,
  type: EntityType,
  input: unknown,
  match = false,
) {
  const data = entitySchemas[type].parse(input);
  await brainScope(db, actor, data.workspace_id, 'brain.write');
  const values = data as Record<string, unknown>;
  const name = String(values[type === 'person' ? 'display_name' : 'name']);
  if (!normalizeEntity(name))
    fail(422, 'invalid_name', 'Please enter a meaningful name.');
  // Serialize matching within an entity type/workspace, including email/domain aliases.
  await db`SELECT pg_advisory_xact_lock(hashtextextended(${data.workspace_id + ':' + type},18))`;
  await db`SELECT pg_advisory_xact_lock(hashtextextended(${data.workspace_id + ':' + type + ':' + normalizeEntity(name)},18))`;
  if (match) {
    const candidates =
      await db`SELECT * FROM ${db(entityTables[type])} WHERE workspace_id=${data.workspace_id} AND (normalized_name=${normalizeEntity(name)} ${type === 'person' && values.email ? db`OR lower(email)=${String(values.email).toLowerCase()}` : db``} ${type === 'organization' && values.domain ? db`OR lower(domain)=${String(values.domain).toLowerCase()}` : db``}) ORDER BY created_at LIMIT 3`;
    const matches = candidates.filter((r) => {
      if (type === 'person')
        return (
          values.email &&
          String(r.email ?? '').toLowerCase() ===
            String(values.email).toLowerCase()
        );
      return (
        normalizeEntity(r.name) === normalizeEntity(name) ||
        (type === 'organization' &&
          values.domain &&
          r.domain?.toLowerCase() === String(values.domain).toLowerCase())
      );
    });
    if (matches.length === 1) return { entity: matches[0], ambiguous: false };
    // Even a full name can describe two different people; name-only people require review.
    const sameName =
      type === 'person' &&
      candidates.some(
        (r) => normalizeEntity(r.display_name) === normalizeEntity(name),
      );
    if (matches.length > 1 || sameName)
      return { entity: null, ambiguous: true };
  }
  const [entity] =
    await db`INSERT INTO ${db(entityTables[type])} ${db({ ...values, normalized_name: normalizeEntity(name), metadata: db.json(values.metadata as never) })} RETURNING *`;
  await audit(
    db,
    actor,
    type + '.created',
    { workspace: data.workspace_id },
    { entity_id: entity.id },
  );
  return { entity, ambiguous: false };
}
export const createEntity = (actor: Actor, type: EntityType, input: unknown) =>
  sql.begin(
    async (tx) => (await createEntityInTx(tx, actor, type, input)).entity,
  );
export async function updateEntity(
  actor: Actor,
  type: EntityType,
  workspace: string,
  id: string,
  input: unknown,
) {
  const schema = entityPatchSchemas[type];
  const data = schema.parse(input);
  const changedName =
    'display_name' in data
      ? data.display_name
      : 'name' in data
        ? data.name
        : undefined;
  return sql.begin(async (tx) => {
    await humanManager(tx, actor, workspace);
    await validateTarget(tx, actor, workspace, type, id);
    if (!Object.keys(data).length)
      fail(422, 'empty_patch', 'No fields to update.');
    const [entity] =
      await tx`UPDATE ${tx(entityTables[type])} SET ${tx({ ...data, ...(changedName ? { normalized_name: normalizeEntity(changedName) } : {}), ...(data.metadata ? { metadata: tx.json(data.metadata) } : {}) })},updated_at=now() WHERE id=${id} AND workspace_id=${workspace} RETURNING *`;
    await audit(
      tx,
      actor,
      type + '.updated',
      { workspace },
      { entity_id: id, fields: Object.keys(data) },
    );
    return entity;
  });
}
export async function linkEntitiesInTx(
  db: Query,
  actor: Actor,
  input: unknown,
) {
  const data = entityLinkInput.parse(input);
  await brainScope(db, actor, data.workspace_id, 'brain.write');
  await validateTarget(
    db,
    actor,
    data.workspace_id,
    data.from_type,
    data.from_id,
  );
  await validateTarget(db, actor, data.workspace_id, data.to_type, data.to_id);
  if (
    data.relation === 'WORKS_AT' &&
    !(data.from_type === 'person' && data.to_type === 'organization')
  )
    fail(
      422,
      'invalid_relation',
      'WORKS_AT connects a person to an organization.',
    );
  if (
    data.relation === 'DEPENDS_ON' &&
    !(data.from_type === 'project' && data.to_type === 'project')
  )
    fail(422, 'invalid_relation', 'DEPENDS_ON connects projects.');
  const [link] =
    await db`INSERT INTO entity_links ${db(data)} ON CONFLICT(workspace_id,from_type,from_id,to_type,to_id,relation) DO UPDATE SET updated_at=entity_links.updated_at RETURNING *`;
  await audit(
    db,
    actor,
    'brain.entity.linked',
    { workspace: data.workspace_id },
    { entity_link_id: link.id },
  );
  return link;
}
export const linkEntities = (actor: Actor, input: unknown) =>
  sql.begin((tx) => linkEntitiesInTx(tx, actor, input));
