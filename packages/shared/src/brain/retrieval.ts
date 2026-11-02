import { sql } from '../../../db/src/client.js';
import { type Actor, AppError } from '../contracts.js';
import { brainScope, visibleMemory } from './access.js';
import { searchInput } from './schemas.js';
import { listEntities, normalizeEntity } from './entities.js';
import { sourceAttribution } from './items.js';

// Retrieval boundary: a future semantic candidate source can feed the same scoped, bounded contract.
export async function searchBrain(
  actor: Actor,
  input: unknown,
  currentOnly = false,
) {
  const q = searchInput.parse(input);
  await brainScope(sql, actor, q.workspace_id);
  const query = q.q.trim();
  const items =
    await sql`SELECT b.id,b.workspace_id,b.kind,b.title,b.body,b.summary,b.status,b.importance,b.confidence,b.occurred_at,b.created_at,b.updated_at,b.created_by_type,b.created_by_id,b.source_type,b.source_id,b.revision_number,b.supersedes_id,b.metadata,
 coalesce(u.display_name,a.display_name,b.created_by_type) AS author_name,
 coalesce((SELECT jsonb_agg(jsonb_build_object('target_type',l.target_type,'target_id',l.target_id,'relation',l.relation,'title',coalesce(p.name,pe.display_name,o.name))) FROM brain_links l LEFT JOIN projects p ON l.target_type='project' AND p.id=l.target_id LEFT JOIN people pe ON l.target_type='person' AND pe.id=l.target_id LEFT JOIN organizations o ON l.target_type='organization' AND o.id=l.target_id WHERE l.brain_item_id=b.id),'[]'::jsonb) AS links,
 (ts_rank_cd(b.search_vector,websearch_to_tsquery('english',${query}))*10
 + CASE WHEN lower(b.title)=lower(${query}) AND ${query}<>'' THEN 8 ELSE 0 END
 + CASE b.importance WHEN 'critical' THEN 1.5 WHEN 'high' THEN 1 WHEN 'normal' THEN 0.4 ELSE 0 END
 + 0.2/(1+extract(epoch FROM (now()-b.created_at))/86400/30)) AS rank
 FROM brain_items b LEFT JOIN users u ON b.created_by_type='user' AND u.id=b.created_by_id LEFT JOIN agents a ON b.created_by_type='agent' AND a.id=b.created_by_id
 WHERE b.workspace_id=${q.workspace_id} AND ${visibleMemory(sql, actor)}
 AND (${query}='' OR b.search_vector @@ websearch_to_tsquery('english',${query}) OR b.title ILIKE ${'%' + query + '%'} OR EXISTS(
  SELECT 1 FROM brain_links l LEFT JOIN projects p ON l.target_type='project' AND p.id=l.target_id LEFT JOIN people pe ON l.target_type='person' AND pe.id=l.target_id LEFT JOIN organizations o ON l.target_type='organization' AND o.id=l.target_id
  WHERE l.brain_item_id=b.id AND coalesce(p.name,pe.display_name,o.name,'') ILIKE ${'%' + query + '%'}))
 AND b.status=${q.status ?? 'active'} AND (${q.kind ?? null}::text IS NULL OR b.kind=${q.kind ?? null})
 AND (${!currentOnly} OR ((b.valid_from IS NULL OR b.valid_from<=now()) AND (b.valid_until IS NULL OR b.valid_until>=now())))
 AND (${q.importance ?? null}::text IS NULL OR b.importance=${q.importance ?? null}) AND (${q.source_type ?? null}::text IS NULL OR b.source_type=${q.source_type ?? null})
 AND (${q.since ?? null}::timestamptz IS NULL OR coalesce(b.occurred_at,b.created_at)>=${q.since ?? null}) AND (${q.until ?? null}::timestamptz IS NULL OR coalesce(b.occurred_at,b.created_at)<=${q.until ?? null})
 AND (${q.project_id ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM brain_links WHERE brain_item_id=b.id AND target_type='project' AND target_id=${q.project_id ?? null}))
 AND (${q.person_id ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM brain_links WHERE brain_item_id=b.id AND target_type='person' AND target_id=${q.person_id ?? null}))
 AND (${q.organization_id ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM brain_links WHERE brain_item_id=b.id AND target_type='organization' AND target_id=${q.organization_id ?? null}))
 ORDER BY ${query ? sql`rank DESC,` : sql``} b.created_at DESC,b.id DESC LIMIT ${q.limit + 1} OFFSET ${q.cursor}`;
  const hasMore = items.length > q.limit;
  const entities = query
    ? await Promise.all(
        ['project', 'person', 'organization'].map((type) =>
          listEntities(
            actor,
            type as 'project' | 'person' | 'organization',
            q.workspace_id,
            query,
          ),
        ),
      )
    : [[], [], []];
  return {
    items: items.slice(0, q.limit),
    next_cursor: hasMore ? q.cursor + q.limit : null,
    projects: entities[0],
    people: entities[1],
    organizations: entities[2],
  };
}
export async function buildBrainContext(
  actor: Actor,
  input: {
    workspace_id: string;
    query: string;
    channel_id?: string;
    project_id?: string;
    person_id?: string;
  },
  limits = { items: 12, characters: 15000 },
) {
  try {
    await brainScope(sql, actor, input.workspace_id);
  } catch (error) {
    if (error instanceof AppError && error.status === 403)
      return { items: [], characters: 0 };
    throw error;
  }
  const tokens = [
    ...new Set(input.query.toLowerCase().match(/[\p{L}\p{N}']{3,}/gu) ?? []),
  ].slice(0, 32);
  const queries = [input.query.slice(0, 500), tokens.join(' OR ')];
  const candidates = new Map<string, Record<string, unknown>>();
  const normalizedQuery = normalizeEntity(input.query);
  const mentionedEntities = await sql`SELECT * FROM (
   SELECT id,'project' AS type,normalized_name FROM projects WHERE workspace_id=${input.workspace_id}
   UNION ALL SELECT id,'person',normalized_name FROM people WHERE workspace_id=${input.workspace_id}
   UNION ALL SELECT id,'organization',normalized_name FROM organizations WHERE workspace_id=${input.workspace_id}
  ) e WHERE length(normalized_name)>=3 AND strpos(${normalizedQuery},normalized_name)>0 ORDER BY length(normalized_name) DESC LIMIT 5`;
  const relatedFilters: Record<string, string>[] = [];
  for (const entity of mentionedEntities)
    relatedFilters.push({ [entity.type + '_id']: String(entity.id) });
  if (input.project_id)
    relatedFilters.unshift({ project_id: input.project_id });
  if (input.person_id) relatedFilters.unshift({ person_id: input.person_id });
  for (const filter of relatedFilters.slice(0, 5)) {
    const result = await searchBrain(
      actor,
      { workspace_id: input.workspace_id, ...filter, limit: 20 },
      true,
    );
    for (const row of result.items)
      candidates.set(row.id, { ...row, rank: Number(row.rank) + 4 });
  }
  for (const query of queries) {
    if (!query.trim() && !input.project_id && !input.person_id) continue;
    const result = await searchBrain(
      actor,
      {
        workspace_id: input.workspace_id,
        q: query,
        project_id: input.project_id,
        person_id: input.person_id,
        limit: 30,
      },
      true,
    );
    for (const row of result.items)
      if (!candidates.has(row.id)) candidates.set(row.id, row);
  }
  if (input.channel_id) {
    const rows =
      await sql`SELECT b.id FROM brain_items b JOIN brain_links l ON l.brain_item_id=b.id WHERE b.workspace_id=${input.workspace_id} AND b.status='active' AND (b.valid_from IS NULL OR b.valid_from<=now()) AND (b.valid_until IS NULL OR b.valid_until>=now()) AND l.target_type='channel' AND l.target_id=${input.channel_id} AND ${visibleMemory(sql, actor)} LIMIT 10`;
    if (rows.length) {
      const { readMemory } = await import('./items.js');
      for (const row of rows)
        candidates.set(
          row.id,
          await readMemory(actor, input.workspace_id, row.id),
        );
    }
  }
  const items: Record<string, unknown>[] = [];
  const maxItems = Math.min(15, Math.max(1, limits.items)),
    maxChars = Math.min(18000, Math.max(2, limits.characters));
  let characters = 2;
  for (const row of [...candidates.values()].sort(
    (a, b) => Number(b.rank ?? 0) - Number(a.rank ?? 0),
  )) {
    if (items.length >= maxItems) break;
    const excerpt = String(row.summary ?? row.body).slice(0, 1600);
    const entry = {
      id: row.id,
      kind: row.kind,
      title: row.title,
      excerpt,
      attribution: {
        type: row.created_by_type,
        id: row.created_by_id,
        name: row.author_name,
        confirmed_by:
          (row.metadata as Record<string, unknown>)?.confirmed_by ?? null,
      },
      source_type: row.source_type,
      source_attribution: await sourceAttribution(
        actor,
        input.workspace_id,
        String(row.source_type),
        row.source_id ? String(row.source_id) : null,
      ),
      source_id: row.source_id,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      relations: row.links,
    };
    const size = JSON.stringify(entry).length + (items.length ? 1 : 0);
    if (characters + size > maxChars) continue;
    items.push(entry);
    characters += size;
  }
  return { items, characters };
}
