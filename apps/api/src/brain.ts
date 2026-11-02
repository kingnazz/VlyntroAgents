import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sql } from '../../../packages/db/src/client.js';
import {
  createMemory,
  readMemory,
  updateMemory,
  resolveMemory,
  supersedeMemory,
  revisions,
} from '../../../packages/shared/src/brain/items.js';
import {
  captureBrain,
  brainInbox,
  resolveInbox,
  resolveCaptureEntity,
  entityResolution,
} from '../../../packages/shared/src/brain/capture.js';
import {
  searchBrain,
  buildBrainContext,
} from '../../../packages/shared/src/brain/retrieval.js';
import {
  listEntities,
  createEntity,
  updateEntity,
  linkEntities,
} from '../../../packages/shared/src/brain/entities.js';
import {
  entityDetail,
  todayOverview,
} from '../../../packages/shared/src/brain/overview.js';
import { humanManager } from '../../../packages/shared/src/brain/access.js';
import {
  itemInput,
  itemPatch,
  captureInput,
  entitySchemas,
  entityPatchSchemas,
  entityTables,
  entityLinkInput,
  type EntityType,
  searchInput,
} from '../../../packages/shared/src/brain/schemas.js';
type Route = (
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  summary: string,
  handler: (req: FastifyRequest, reply: FastifyReply) => unknown,
  body?: z.ZodType,
) => void;
const workspace = (req: FastifyRequest) =>
  z.object({ workspace_id: z.uuid() }).parse(req.query).workspace_id;
const id = (req: FastifyRequest) =>
  z.object({ id: z.uuid() }).parse(req.params).id;
const revision = z
  .object({ expected_revision: z.number().int().positive() })
  .strict();
export function registerBrainRoutes(route: Route) {
  route(
    'POST',
    '/api/v1/brain/inbox/:id/resolve-entity',
    'Human resolution of an ambiguous extracted entity',
    (req) => resolveCaptureEntity(req.actor, workspace(req), id(req), req.body),
    entityResolution,
  );
  route(
    'GET',
    '/api/v1/brain/search',
    'Search scoped durable memory and entities',
    (req) => searchBrain(req.actor, req.query),
  );
  route(
    'POST',
    '/api/v1/brain/capture',
    'Persist raw capture before asynchronous processing',
    (req) => captureBrain(req.actor, req.body),
    captureInput,
  );
  route(
    'POST',
    '/api/v1/brain/items',
    'Create attributable memory',
    (req) => createMemory(req.actor, req.body),
    itemInput,
  );
  route(
    'GET',
    '/api/v1/brain/items/:id',
    'Memory with source and relationships',
    (req) => readMemory(req.actor, workspace(req), id(req)),
  );
  route(
    'PATCH',
    '/api/v1/brain/items/:id',
    'Versioned human memory edit',
    (req) => updateMemory(req.actor, workspace(req), id(req), req.body),
    itemPatch,
  );
  route(
    'POST',
    '/api/v1/brain/items/:id/archive',
    'Archive without deleting history',
    (req) =>
      resolveMemory(
        req.actor,
        workspace(req),
        id(req),
        'archive',
        revision.parse(req.body).expected_revision,
      ),
    revision,
  );
  const supersede = itemInput
    .omit({ workspace_id: true, status: true })
    .extend(revision.shape);
  route(
    'POST',
    '/api/v1/brain/items/:id/supersede',
    'Replace memory and retain the previous record',
    (req) => supersedeMemory(req.actor, workspace(req), id(req), req.body),
    supersede,
  );
  route(
    'GET',
    '/api/v1/brain/items/:id/revisions',
    'Human-readable immutable revision history',
    (req) => revisions(req.actor, workspace(req), id(req)),
  );
  route(
    'GET',
    '/api/v1/brain/inbox',
    'Captures and suggestions needing human review',
    (req) => brainInbox(req.actor, workspace(req)),
  );
  for (const action of ['confirm', 'dismiss', 'retry'] as const)
    route(
      'POST',
      `/api/v1/brain/inbox/:id/${action}`,
      'Review capture or proposed memory',
      (req) =>
        resolveInbox(
          req.actor,
          workspace(req),
          id(req),
          action,
          z.record(z.string(), z.unknown()).parse(req.body ?? {}),
        ),
      z.record(z.string(), z.unknown()),
    );
  const preview = z
    .object({
      workspace_id: z.uuid(),
      query: z.string().min(1).max(4000),
      project_id: z.uuid().optional(),
    })
    .strict();
  route(
    'POST',
    '/api/v1/brain/context-preview',
    'Human administrator context retrieval preview',
    async (req) => {
      const data = preview.parse(req.body);
      await humanManager(sql, req.actor, data.workspace_id);
      return buildBrainContext(req.actor, data);
    },
    preview,
  );
  route(
    'POST',
    '/api/v1/brain/entity-links',
    'Connect existing workspace entities',
    (req) => linkEntities(req.actor, req.body),
    entityLinkInput,
  );
  route(
    'GET',
    '/api/v1/brain/today',
    'Attention, follow-ups and recent workspace history',
    (req) => todayOverview(req.actor, workspace(req)),
  );
  for (const type of Object.keys(entityTables) as EntityType[]) {
    const path = '/api/v1/' + entityTables[type];
    route('GET', path, 'Search ' + entityTables[type], (req) =>
      listEntities(
        req.actor,
        type,
        workspace(req),
        z.object({ q: z.string().max(500).default('') }).parse(req.query).q,
      ),
    );
    route(
      'POST',
      path,
      'Create ' + type,
      (req) => createEntity(req.actor, type, req.body),
      entitySchemas[type],
    );
    route(
      'GET',
      path + '/:id',
      'Aggregate linked ' + type + ' history',
      (req) => entityDetail(req.actor, type, workspace(req), id(req)),
    );
    route(
      'PATCH',
      path + '/:id',
      'Update ' + type,
      (req) => updateEntity(req.actor, type, workspace(req), id(req), req.body),
      entityPatchSchemas[type],
    );
  }
}
export const brainQuerySchema = (url: string) =>
  url === '/api/v1/brain/search'
    ? searchInput
    : url.startsWith('/api/v1/brain/') ||
        ['projects', 'people', 'organizations'].some((path) =>
          url.startsWith('/api/v1/' + path),
        )
      ? z.object({ workspace_id: z.uuid(), q: z.string().optional() })
      : null;
