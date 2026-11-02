import { registerBrainRoutes, brainQuerySchema } from './brain.js';
import { registerOAuth, isOAuthProtocolPath } from './oauth.js';
import { registerConnections } from './connections.js';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { verify, hash, argon2id } from 'argon2';
import { z } from 'zod';
import { sql } from '../../../packages/db/src/client.js';
import {
  AppError,
  type Actor,
  fail,
  identifier,
  stateWrite,
  messageInput,
  taskInput,
  taskPatch,
  approvalInput,
} from '../../../packages/shared/src/contracts.js';
import {
  authenticateToken,
  audit,
  authorize,
  newToken,
  tokenHash,
} from '../../../packages/shared/src/security.js';
import {
  namespaceInfo,
  readState,
  writeState,
} from '../../../packages/shared/src/state.js';
import {
  channelInfo,
  createTask,
  listScoped,
  postMessage,
  scopedRow,
  updateTask,
} from '../../../packages/shared/src/work.js';
import {
  requestApproval,
  resolveApproval,
} from '../../../packages/shared/src/approvals.js';
import { registerMcp } from './mcp.js';
import { responseModel, modelSchemas, toOpenapiSchema } from './models.js';
import {
  createArtifact,
  artifactInput,
} from '../../../packages/shared/src/artifacts.js';
declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
}
const base = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const production = process.env.NODE_ENV === 'production';
const page = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.string().max(100).optional(),
});
const listFilter = page.extend({
  workspace: z.string().max(100).optional(),
  status: z.string().max(40).optional(),
  agent: z.uuid().optional(),
  priority: z.coerce.number().int().min(0).max(4).optional(),
});
const eventFilter = z.object({
  workspace: z.string().max(100).optional(),
  namespace: identifier.optional(),
  since: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  after: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
});
export async function authenticate(req: FastifyRequest): Promise<Actor> {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    const actor = await authenticateToken(
      sql,
      req.headers.authorization.slice(7),
      req.url.split('?')[0] === '/mcp' ? base.replace(/\/$/, '') + '/mcp' : '',
    );
    return actor;
  }
  const token = req.cookies.hq_session;
  if (!token) return fail(401, 'unauthenticated', 'Please sign in.');
  const [session] =
    await sql`SELECT s.id,s.user_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now()`;
  if (!session)
    return fail(401, 'unauthenticated', 'Session expired. Please sign in.');
  await sql`UPDATE sessions SET last_seen_at=now() WHERE id=${session.id}`;
  return {
    type: 'user',
    id: session.user_id,
    role: session.role,
    sessionId: session.id,
  };
}
export async function queryEvents(actor: Actor, input: unknown) {
  const q = eventFilter.parse(input);
  if (q.namespace) {
    await namespaceInfo(sql, q.namespace);
    await authorize(sql, actor, 'documents.read', { namespace: q.namespace });
  }
  if (q.workspace) {
    const [w] =
      await sql`SELECT id FROM workspaces WHERE slug=${q.workspace} OR id::text=${q.workspace}`;
    if (w) await authorize(sql, actor, 'workspace.read', { workspace: w.id });
  }
  return sql`SELECT e.* FROM events e LEFT JOIN workspaces w ON w.id=e.workspace_id WHERE
  (${q.workspace ?? null}::text IS NULL OR w.slug=${q.workspace ?? null} OR w.id::text=${q.workspace ?? null})
  AND (${q.namespace ?? null}::text IS NULL OR e.namespace_id=${q.namespace ?? null})
  AND (${q.since ?? null}::timestamptz IS NULL OR e.created_at>${q.since ?? null})
  AND (${q.after ?? null}::bigint IS NULL OR e.id>${q.after ?? null})
  AND (${actor.type === 'user'} OR EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=${actor.id} AND ((p.workspace_id=e.workspace_id AND p.permission='workspace.read') OR (p.namespace_id=e.namespace_id AND p.permission='documents.read'))))
  ORDER BY e.id ${q.after ? sql`ASC` : sql`DESC`} LIMIT ${q.limit}`;
}
type Handler = (req: FastifyRequest, reply: FastifyReply) => unknown;
export async function buildApp(logging = false) {
  const app = Fastify({
    logger: logging
      ? {
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers.set-cookie',
          ],
          serializers: {
            req: (req) => ({
              method: req.method,
              url: req.url?.split('?')[0],
              id: req.id,
            }),
            err: () => ({
              type: 'Error',
              message: 'Request failed',
              stack: '',
            }),
          },
        }
      : false,
    bodyLimit: 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY === 'true',
    disableRequestLogging: true,
  });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  const openapi: Record<string, Record<string, unknown>> = {};
  function route(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    summary: string,
    handler: Handler,
    body?: z.ZodType,
    publicRoute = false,
  ) {
    const path = url.replace(/:([a-z_]+)/g, '{$1}');
    const parameters = [...url.matchAll(/:([a-z_]+)/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    const responseSchema = responseModel(url, method);
    const bodyName = (method + url + '_body').replace(/[^a-zA-Z0-9]/g, '_');
    if (body) modelSchemas[bodyName] = toOpenapiSchema(body, bodyName, 'input');
    const querySchema =
      method === 'GET'
        ? (brainQuerySchema(url) ??
          (url.endsWith('/events')
            ? eventFilter
            : [
                  '/api/v1/tasks',
                  '/api/v1/runs',
                  '/api/v1/approvals',
                  '/api/v1/artifacts',
                ].includes(url)
              ? listFilter
              : url.endsWith('/messages') || url.endsWith('/channels')
                ? page
                : null))
        : null;
    if (querySchema) {
      const schema = z.toJSONSchema(querySchema);
      for (const [name, property] of Object.entries(schema.properties ?? {}))
        parameters.push({
          name,
          in: 'query',
          required: false,
          schema: property as { type: string },
        });
    }
    openapi[path] ??= {};
    openapi[path][method.toLowerCase()] = {
      summary,
      parameters,
      security: publicRoute ? [] : [{ cookieAuth: [] }, { agentBearer: [] }],
      ...(body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/' + bodyName },
                },
              },
            },
          }
        : {}),
      responses: {
        200: {
          description: 'Success',
          content: url.endsWith('.zip')
            ? {
                'application/zip': {
                  schema: { type: 'string', format: 'binary' },
                },
              }
            : url.endsWith('/download') ||
                url.startsWith('/api/v1/connections/setup/')
              ? { 'text/plain': { schema: { type: 'string' } } }
              : { 'application/json': { schema: responseSchema } },
        },
        400: { description: 'Invalid request' },
        401: { description: 'Authentication required' },
        403: { description: 'Insufficient permission' },
        422: {
          description: 'Zod input validation rejected this request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        429: { description: 'Request or login rate limit reached' },
        ...(url === '/api/v1/health'
          ? {
              503: {
                description: 'Database or worker unavailable',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Health' },
                  },
                },
              },
            }
          : {}),
        409: {
          description: 'Version or state conflict',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    };
    app.route({
      method,
      url,
      handler,
      ...(url === '/api/v1/auth/login'
        ? { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }
        : {}),
    });
  }
  app.addHook('onResponse', async (req, reply) => {
    app.log.info(
      {
        request_id: req.id,
        method: req.method,
        route: req.routeOptions.url,
        status_code: reply.statusCode,
      },
      'request.completed',
    );
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Request-ID', req.id);
    const path = req.url.split('?')[0];
    const protocol = isOAuthProtocolPath(path);
    const setup =
      ['GET', 'HEAD'].includes(req.method) &&
      (path.startsWith('/api/v1/connections/setup/') ||
        [
          '/api/v1/connections/skill.zip',
          '/api/v1/connections/plugin.zip',
        ].includes(path));
    if (protocol) return;
    if (path === '/mcp') {
      reply
        .header('Access-Control-Allow-Origin', '*')
        .header('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS')
        .header(
          'Access-Control-Allow-Headers',
          'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID',
        )
        .header(
          'Access-Control-Expose-Headers',
          'WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version',
        )
        .header('Cache-Control', 'no-store');
      if (req.method === 'OPTIONS') return reply.code(204).send();
    }
    if (
      [
        '/api/v1/brain/',
        '/api/v1/projects',
        '/api/v1/people',
        '/api/v1/organizations',
        '/api/v1/connections',
      ].some((path) => req.url.startsWith(path))
    )
      reply.header('Cache-Control', 'private, no-store');
    if (req.headers.origin && req.headers.origin !== base && path !== '/mcp')
      fail(403, 'invalid_origin', 'Cross-origin requests are not accepted.');
    const publicRoute = [
      '/api/v1/health',
      '/api/v1/auth/login',
      '/api/v1/openapi.json',
    ].includes(req.url.split('?')[0]);
    if (!publicRoute && !setup) {
      try {
        req.actor = await authenticate(req);
      } catch (error) {
        if (path === '/mcp')
          reply.header(
            'WWW-Authenticate',
            `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="brain.read brain.propose offline_access"`,
          );
        throw error;
      }
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !req.headers.authorization &&
      req.headers.origin !== base &&
      !setup
    )
      fail(403, 'csrf', 'Same-origin Origin header required.');
  });
  app.setErrorHandler((error, req, reply) => {
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof z.ZodError
          ? 422
          : ((error as { statusCode?: number }).statusCode ?? 500);
    if (status >= 500)
      app.log.error(
        { requestId: req.id, code: 'internal_error' },
        'Request failed',
      );
    reply.code(status).send({
      error: {
        code:
          error instanceof AppError
            ? error.code
            : status === 422
              ? 'validation_error'
              : status === 429
                ? 'rate_limited'
                : status >= 500
                  ? 'internal_error'
                  : 'request_error',
        message:
          error instanceof AppError
            ? error.message
            : status === 422
              ? 'Check the request fields.'
              : status === 429
                ? 'Too many requests. Try again later.'
                : 'Request could not be completed.',
        ...(error instanceof AppError ? error.details : {}),
      },
      request_id: req.id,
    });
  });
  route(
    'GET',
    '/api/v1/health',
    'Database and worker health',
    async (_req, reply) => {
      const [db] = await sql`SELECT 1 AS ok`;
      const [worker] =
        await sql`SELECT max(last_seen_at) AS last_seen_at,coalesce(bool_or(last_seen_at>now()-interval '45 seconds'),false) AS healthy FROM worker_heartbeats`;
      if (!worker.healthy) reply.code(503);
      return {
        status: db.ok && worker.healthy ? 'healthy' : 'degraded',
        version: '1.0.0',
        database: 'connected',
        worker,
      };
    },
    undefined,
    true,
  );
  const loginSchema = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
    .strict();
  const dummyHash = await hash(newToken(), {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  route(
    'POST',
    '/api/v1/auth/login',
    'Sign in with a private owner account',
    async (req, reply) => {
      const data = loginSchema.parse(req.body);
      const email = data.email.toLowerCase(),
        key = tokenHash(email + ':' + req.ip);
      const [attempt] =
        await sql`INSERT INTO login_attempts(key,reset_at) VALUES(${key},now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.reset_at<now() THEN 1 ELSE login_attempts.attempts+1 END,reset_at=CASE WHEN login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE login_attempts.reset_at END RETURNING attempts`;
      if (attempt.attempts > 8)
        fail(
          429,
          'login_locked',
          'Too many failed attempts. Try again in 15 minutes.',
        );
      const [user] = await sql`SELECT * FROM users WHERE email=${email}`;
      const valid = await verify(
        user?.password_hash ?? dummyHash,
        data.password,
      );
      if (!valid || !user) {
        await audit(
          sql,
          { type: 'system', id: 'auth' },
          'auth.login_failed',
          {},
          { subject_hash: tokenHash(email) },
        );
        fail(401, 'invalid_credentials', 'Email or password is incorrect.');
      }
      const token = newToken();
      await sql.begin(async (tx) => {
        await tx`DELETE FROM login_attempts WHERE key=${key}`;
        if (req.cookies.hq_session)
          await tx`DELETE FROM sessions WHERE token_hash=${tokenHash(req.cookies.hq_session)}`;
        await tx`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(${user.id},${tokenHash(token)},now()+interval '7 days')`;
        await tx`DELETE FROM sessions WHERE expires_at<now()`;
        await audit(tx, { type: 'user', id: user.id }, 'auth.login', {}, {});
      });
      reply.setCookie('hq_session', token, {
        httpOnly: true,
        secure: production,
        sameSite: 'strict',
        path: '/',
        maxAge: 604800,
      });
      return {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
      };
    },
    loginSchema,
    true,
  );
  route(
    'POST',
    '/api/v1/auth/logout',
    'Invalidate the current session',
    async (req, reply) => {
      if (req.actor.type !== 'user')
        fail(403, 'human_required', 'Use token revocation for agents.');
      await sql`DELETE FROM sessions WHERE id=${req.actor.sessionId!}`;
      await audit(sql, req.actor, 'auth.logout', {}, {});
      reply.clearCookie('hq_session', { path: '/' });
      return { ok: true };
    },
  );
  route('GET', '/api/v1/auth/me', 'Current user', async (req) => {
    if (req.actor.type !== 'user')
      return { id: req.actor.id, display_name: req.actor.slug, role: 'agent' };
    const [user] =
      await sql`SELECT id,email,display_name,role FROM users WHERE id=${req.actor.id}`;
    return user;
  });
  route(
    'GET',
    '/api/v1/workspaces',
    'List accessible workspaces',
    async (req) =>
      sql`SELECT * FROM workspaces w WHERE ${req.actor.type === 'user'} OR EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=${req.actor.id} AND p.workspace_id=w.id AND p.permission='workspace.read') ORDER BY created_at`,
  );
  route('GET', '/api/v1/workspaces/:id', 'Workspace details', async (req) => {
    const { id } = req.params as { id: string };
    const [w] =
      await sql`SELECT * FROM workspaces WHERE id::text=${id} OR slug=${id}`;
    if (!w) return fail(404, 'not_found', 'Workspace not found.');
    await authorize(sql, req.actor, 'workspace.read', { workspace: w.id });
    return w;
  });
  route(
    'GET',
    '/api/v1/workspaces/:workspace/channels',
    'Accessible workspace channels',
    (req) =>
      listScoped(req.actor, 'channels', {
        ...page.parse(req.query),
        workspace: (req.params as { workspace: string }).workspace,
      }),
  );
  route(
    'GET',
    '/api/v1/agents',
    'Agent directory and effective configuration',
    async (req) => {
      if (req.actor.type !== 'user') {
        const [scope] =
          await sql`SELECT 1 FROM agent_permissions WHERE agent_id=${req.actor.id} AND permission='workspace.read'`;
        if (!scope) fail(403, 'scope_required', 'Workspace access required.');
      }
      return sql`SELECT a.*,(SELECT max(started_at) FROM runs r WHERE r.agent_id=a.id) AS last_activity,
       (SELECT title FROM tasks t WHERE t.assigned_agent_id=a.id AND t.status='running'
        AND (${req.actor.type === 'user'} OR EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=${req.actor.id} AND p.workspace_id=t.workspace_id AND p.permission='tasks.read'))
        AND (t.channel_id IS NULL OR NOT EXISTS(SELECT 1 FROM channels c WHERE c.id=t.channel_id AND c.channel_type IN ('private','direct')) OR EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id=t.channel_id AND cm.member_type=${req.actor.type} AND cm.member_id=${req.actor.id})) LIMIT 1) AS current_task
       FROM agents a WHERE NOT EXISTS(SELECT 1 FROM ai_connections WHERE agent_id=a.id) ORDER BY a.created_at,a.slug`;
    },
  );
  route(
    'GET',
    '/api/v1/agents/:id',
    'Agent details and permissions',
    async (req) => {
      const { id } = req.params as { id: string };
      const [a] =
        await sql`SELECT * FROM agents WHERE id::text=${id} OR slug=${id}`;
      if (!a) return fail(404, 'not_found', 'Agent not found.');
      if (req.actor.type !== 'user' && req.actor.id !== a.id)
        fail(
          403,
          'forbidden',
          'Agents may inspect their own configuration only.',
        );
      const permissions =
        await sql`SELECT workspace_id,namespace_id,permission FROM agent_permissions WHERE agent_id=${a.id}`;
      const recent_messages =
        await sql`SELECT m.id,m.body,m.sender_type,m.sender_id,m.created_at,m.channel_id,m.metadata,a.display_name AS sender_name
       FROM messages m JOIN channels c ON c.id=m.channel_id JOIN agents a ON a.id=m.sender_id
       WHERE m.sender_type='agent' AND m.sender_id=${a.id}
       AND (${req.actor.type === 'user'} OR EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=${req.actor.id} AND p.workspace_id=m.workspace_id AND p.permission='messages.read'))
       AND (c.channel_type NOT IN ('private','direct') OR EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id=c.id AND cm.member_type=${req.actor.type} AND cm.member_id=${req.actor.id}))
       ORDER BY m.created_at DESC LIMIT 20`;
      return { ...a, permissions, recent_messages };
    },
  );
  const agentPatch = z
    .object({
      status: z.enum(['disabled', 'offline', 'idle']).optional(),
      model: z.string().min(1).max(100).optional(),
      system_prompt: z.string().max(8000).optional(),
    })
    .strict();
  route(
    'PATCH',
    '/api/v1/agents/:id',
    'Configure or disable an agent',
    async (req) => {
      if (
        req.actor.type !== 'user' ||
        !['owner', 'admin'].includes(req.actor.role ?? '')
      )
        fail(403, 'human_required', 'Administrator required.');
      const data = agentPatch.parse(req.body);
      if (!Object.keys(data).length)
        fail(422, 'empty_patch', 'No fields to update.');
      return sql.begin(async (tx) => {
        const [agent] =
          await tx`UPDATE agents SET ${tx(data)},updated_at=now() WHERE id::text=${(req.params as { id: string }).id} RETURNING *`;
        if (!agent) return fail(404, 'not_found', 'Agent not found.');
        if (data.status === 'disabled')
          await tx`UPDATE jobs SET status='cancelled' WHERE agent_id=${agent.id} AND status IN ('queued','waiting')`;
        await audit(
          tx,
          req.actor,
          'settings.agent_updated',
          {},
          { agent_id: agent.id, fields: Object.keys(data) },
        );
        return agent;
      });
    },
    agentPatch,
  );
  route(
    'GET',
    '/api/v1/channels/:channel/messages',
    'Paginated channel messages',
    async (req) => {
      const room = await channelInfo(
        sql,
        req.actor,
        (req.params as { channel: string }).channel,
        'messages.read',
      );
      const q = page.parse(req.query);
      return sql`SELECT m.*,coalesce(u.display_name,a.display_name,'System') AS sender_name FROM messages m LEFT JOIN users u ON m.sender_type='user' AND m.sender_id=u.id LEFT JOIN agents a ON m.sender_type='agent' AND m.sender_id=a.id WHERE m.channel_id=${room.id} ${q.before ? sql`AND (m.created_at,m.id)<(SELECT created_at,id FROM messages WHERE id::text=${q.before} AND channel_id=${room.id})` : sql``} ORDER BY m.created_at DESC,m.id DESC LIMIT ${q.limit}`;
    },
  );
  route(
    'POST',
    '/api/v1/channels/:channel/messages',
    'Post a message and route mentions',
    (req) =>
      postMessage(
        req.actor,
        (req.params as { channel: string }).channel,
        req.body,
      ),
    messageInput,
  );
  for (const table of ['tasks', 'runs', 'approvals', 'artifacts'] as const) {
    route('GET', `/api/v1/${table}`, `List ${table}`, (req) =>
      listScoped(req.actor, table, listFilter.parse(req.query)),
    );
    route('GET', `/api/v1/${table}/:id`, `${table} detail`, async (req) => {
      const row = await scopedRow(
        sql,
        req.actor,
        table,
        (req.params as { id: string }).id,
        table === 'tasks' ? 'tasks.read' : 'workspace.read',
      );
      if (table === 'artifacts') {
        const { storage_path: _storage, ...safe } = row;
        return safe;
      }
      if (table !== 'tasks') return row;
      return {
        ...row,
        dependencies:
          await sql`SELECT t.* FROM task_dependencies d JOIN tasks t ON t.id=d.depends_on_task_id WHERE d.task_id=${row.id}`,
        runs: await sql`SELECT * FROM runs WHERE task_id=${row.id} ORDER BY started_at DESC LIMIT 30`,
        approvals:
          await sql`SELECT * FROM approvals WHERE task_id=${row.id} ORDER BY created_at DESC LIMIT 30`,
        artifacts:
          await sql`SELECT id,name,artifact_type,created_at FROM artifacts WHERE task_id=${row.id}`,
        messages: row.channel_id
          ? await sql`SELECT * FROM messages WHERE channel_id=${row.channel_id} AND metadata->>'task_id'=${row.id} ORDER BY created_at DESC LIMIT 30`
          : [],
        timeline:
          await sql`SELECT * FROM events WHERE payload->>'task_id'=${row.id} ORDER BY id DESC LIMIT 100`,
      };
    });
  }
  route(
    'POST',
    '/api/v1/tasks',
    'Create and optionally assign a task',
    (req) => createTask(req.actor, req.body),
    taskInput,
  );
  route(
    'PATCH',
    '/api/v1/tasks/:id',
    'Update task state or assignment',
    (req) => updateTask(req.actor, (req.params as { id: string }).id, req.body),
    taskPatch,
  );
  route(
    'GET',
    '/api/v1/runs/:id/steps',
    'Safe action summaries for a run',
    async (req) => {
      const row = await scopedRow(
        sql,
        req.actor,
        'runs',
        (req.params as { id: string }).id,
        'workspace.read',
      );
      return sql`SELECT * FROM run_steps WHERE run_id=${row.id} ORDER BY step_number`;
    },
  );
  route(
    'POST',
    '/api/v1/approvals',
    'Request human approval',
    (req) => requestApproval(req.actor, req.body),
    approvalInput,
  );
  const commentSchema = z
    .object({ comment: z.string().max(4000).default('') })
    .strict();
  for (const [path, status] of [
    ['approve', 'approved'],
    ['reject', 'rejected'],
  ] as const)
    route(
      'POST',
      `/api/v1/approvals/:id/${path}`,
      `${path} the exact reviewed action`,
      (req) =>
        resolveApproval(
          req.actor,
          (req.params as { id: string }).id,
          status,
          commentSchema.parse(req.body ?? {}).comment,
        ),
      commentSchema,
    );
  route(
    'GET',
    '/api/v1/state/:namespace/:key',
    'Read versioned Blackboard state',
    (req) => {
      const p = req.params as { namespace: string; key: string };
      return readState(
        req.actor,
        identifier.parse(p.namespace),
        identifier.parse(p.key),
      );
    },
  );
  route(
    'POST',
    '/api/v1/state/:namespace/:key',
    'Optimistic Blackboard write with atomic audit',
    (req) => {
      const p = req.params as { namespace: string; key: string };
      return writeState(
        req.actor,
        identifier.parse(p.namespace),
        identifier.parse(p.key),
        req.body,
      );
    },
    stateWrite,
  );
  route(
    'GET',
    '/api/v1/state/:namespace',
    'List Blackboard keys',
    async (req) => {
      const namespace = identifier.parse(
        (req.params as { namespace: string }).namespace,
      );
      await namespaceInfo(sql, namespace);
      await authorize(sql, req.actor, 'documents.read', { namespace });
      return sql`SELECT key,version,updated_by,updated_at FROM documents WHERE namespace_id=${namespace} ORDER BY key`;
    },
  );
  route(
    'GET',
    '/api/v1/namespaces',
    'Accessible Blackboard namespaces',
    (req) =>
      sql`SELECT n.* FROM namespaces n WHERE ${req.actor.type === 'user'} OR EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=${req.actor.id} AND p.namespace_id=n.id AND p.permission='documents.read')`,
  );
  route('GET', '/api/v1/events', 'Append-only audit log', (req) =>
    queryEvents(req.actor, req.query),
  );
  route(
    'POST',
    '/api/v1/artifacts',
    'Save a bounded text artifact or HTTPS reference',
    (req) => createArtifact(req.actor, req.body),
    artifactInput,
  );
  route(
    'GET',
    '/api/v1/artifacts/:id/download',
    'Download an authenticated artifact as a safe attachment',
    async (req, reply) => {
      const artifact = await scopedRow(
        sql,
        req.actor,
        'artifacts',
        (req.params as { id: string }).id,
        'workspace.read',
      );
      reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="${artifact.id}.txt"`,
        )
        .header('X-Content-Type-Options', 'nosniff');
      return artifact.content_text ?? '';
    },
  );
  openapi['/api/v1/stream'] = {
    get: {
      summary:
        'Authenticated event stream with Last-Event-ID replay and heartbeat comments',
      security: [{ cookieAuth: [] }, { agentBearer: [] }],
      parameters: [
        { in: 'header', name: 'Last-Event-ID', schema: { type: 'string' } },
        ...['workspace', 'namespace', 'since', 'after'].map((name) => ({
          in: 'query',
          name,
          schema: { type: 'string' },
        })),
      ],
      responses: {
        200: {
          description: 'SSE events and heartbeat comments',
          content: { 'text/event-stream': { schema: { type: 'string' } } },
        },
        401: { description: 'Authentication required' },
      },
    },
  };
  openapi['/mcp'] = {
    post: {
      summary: 'Stateless MCP Streamable HTTP',
      security: [{ agentBearer: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['jsonrpc', 'method'],
              properties: {
                jsonrpc: { const: '2.0' },
                id: {},
                method: { type: 'string' },
                params: { type: 'object' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'MCP JSON-RPC response',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        202: { description: 'Notification accepted' },
        401: { description: 'Agent bearer token required' },
      },
    },
  };
  const streamCounts = new Map<string, number>();
  const streamClosers = new Set<() => void>();
  app.addHook('preClose', async () => {
    for (const close of streamClosers) close();
  });
  app.get('/api/v1/stream', async (req, reply) => {
    const q = eventFilter.parse(req.query);
    const actor = req.actor;
    if ((streamCounts.get(actor.id) ?? 0) >= 4)
      return fail(429, 'stream_limit', 'Too many live connections.');
    let cursor = req.headers['last-event-id']?.toString() ?? q.after;
    if (cursor && !/^\d{1,20}$/.test(cursor))
      fail(422, 'invalid_cursor', 'Invalid event cursor.');
    if (!cursor) {
      const [row] =
        await sql`SELECT coalesce(max(id),0)::text AS id FROM events`;
      cursor = row.id;
    }
    await queryEvents(actor, { ...q, after: cursor, limit: 1 });
    streamCounts.set(actor.id, (streamCounts.get(actor.id) ?? 0) + 1);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 2500\n\n');
    let busy = false,
      closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      streamClosers.delete(close);
      clearInterval(timer);
      streamCounts.set(
        actor.id,
        Math.max(0, (streamCounts.get(actor.id) ?? 1) - 1),
      );
      reply.raw.end();
    };
    const timer = setInterval(async () => {
      if (busy || closed) return;
      busy = true;
      try {
        await authenticate(req);
        const events = await queryEvents(actor, {
          ...q,
          after: cursor,
          limit: 200,
        });
        for (const event of events) {
          cursor = String(event.id);
          if (
            !reply.raw.write(
              `id: ${event.id}\nevent: ${event.action}\ndata: ${JSON.stringify(event)}\n\n`,
            )
          ) {
            close();
            break;
          }
        }
        if (!closed) reply.raw.write(': heartbeat\n\n');
      } catch {
        close();
      } finally {
        busy = false;
      }
    }, 1000);
    streamClosers.add(close);
    req.raw.on('close', close);
  });
  route(
    'GET',
    '/api/v1/openapi.json',
    'OpenAPI 3.1 contract',
    () => ({
      openapi: '3.1.0',
      info: { title: 'Vlyntro Agent HQ', version: '1.0.0' },
      servers: [{ url: base }],
      paths: openapi,
      components: {
        securitySchemes: {
          agentBearer: {
            type: 'http',
            scheme: 'bearer',
            description:
              'SHA-256 hashed, scoped agent token. MCP accepts this scheme only.',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'hq_session',
            description:
              'HttpOnly server session. Mutations require a same-origin Origin header.',
          },
        },
        schemas: modelSchemas,
      },
    }),
    undefined,
    true,
  );
  registerBrainRoutes(route);
  registerConnections(route);
  await registerOAuth(app);
  await registerMcp(app);
  return app;
}
