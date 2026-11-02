import type { FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { sql } from '../../../packages/db/src/client.js';
import {
  AppError,
  fail,
  identifier,
  stateWrite,
  taskInput,
  approvalInput,
} from '../../../packages/shared/src/contracts.js';
import { readState, writeState } from '../../../packages/shared/src/state.js';
import {
  channelInfo,
  listScoped,
  postMessage,
  createTask,
  scopedRow,
} from '../../../packages/shared/src/work.js';
import { requestApproval } from '../../../packages/shared/src/approvals.js';
import { queryEvents } from './app.js';
import { searchBrain } from '../../../packages/shared/src/brain/retrieval.js';
import { readMemory } from '../../../packages/shared/src/brain/items.js';
import { captureBrain } from '../../../packages/shared/src/brain/capture.js';
import { listEntities } from '../../../packages/shared/src/brain/entities.js';
import { entityDetail } from '../../../packages/shared/src/brain/overview.js';
import {
  searchInput,
  captureInput,
} from '../../../packages/shared/src/brain/schemas.js';
import { connectionForActor } from '../../../packages/shared/src/connections.js';
export async function registerMcp(app: FastifyInstance) {
  app.post('/mcp', async (req, reply) => {
    if (
      req.actor.type !== 'agent' ||
      !req.headers.authorization?.startsWith('Bearer ')
    )
      fail(401, 'bearer_required', 'MCP requires an agent bearer token.');
    const actor = req.actor;
    const connection = await connectionForActor(actor);
    const brainTools = new Set([
      'search_brain',
      'read_brain_item',
      'capture_brain_item',
      'list_projects',
      'get_project',
      'list_people',
      'get_person',
      'list_decisions',
      'get_brain_connection',
    ]);
    const server = new McpServer(
      {
        name: 'vlyntro-agent-hq',
        version: '1.0.0',
      },
      {
        instructions: connection
          ? `You are connected to Vlyntro Brain as ${connection.label}. Your workspace is ${connection.workspace_id}; workspace_id may be omitted. Use search_brain and read_brain_item for relevant attributed context. Capture is available only when granted. A raw capture may still need processing or human review. Preserve human versus agent provenance and do not save hidden reasoning or secrets. Use get_brain_connection to verify identity and access.`
          : undefined,
      },
    );
    const register = (
      name: string,
      shape: z.ZodRawShape,
      run: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      if (
        connection &&
        (!brainTools.has(name) ||
          (name === 'capture_brain_item' &&
            !connection.scopes.includes('brain.propose')))
      )
        return;
      const inputShape =
        connection && 'workspace_id' in shape
          ? { ...shape, workspace_id: z.uuid().optional() }
          : shape;
      server.registerTool(name, { inputSchema: inputShape }, async (args) => {
        try {
          if (
            connection &&
            args.workspace_id &&
            args.workspace_id !== connection.workspace_id
          )
            fail(
              403,
              'workspace_mismatch',
              'This connection is bound to a different workspace.',
            );
          const scopedArgs =
            connection && 'workspace_id' in shape
              ? { ...args, workspace_id: connection.workspace_id }
              : args;
          return {
            content: [
              { type: 'text', text: JSON.stringify(await run(scopedArgs)) },
            ],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error:
                    error instanceof AppError ? error.code : 'operation_failed',
                  message:
                    error instanceof AppError
                      ? error.message
                      : 'The operation was not accepted.',
                  ...(error instanceof AppError ? error.details : {}),
                }),
              },
            ],
          };
        }
      });
    };
    if (connection)
      register('get_brain_connection', {}, async () => ({
        identity: connection.label,
        client_kind: connection.client_kind,
        workspace_id: connection.workspace_id,
        access: connection.scopes.filter((s: string) => s !== 'offline_access'),
        expires_at: connection.expires_at,
        connected: true,
      }));
    register('read_state', { namespace: identifier, key: identifier }, (a) =>
      readState(actor, String(a.namespace), String(a.key)),
    );
    register(
      'write_state',
      { namespace: identifier, key: identifier, ...stateWrite.shape },
      (a) =>
        writeState(actor, String(a.namespace), String(a.key), {
          value: a.value,
          expected_version: a.expected_version,
        }),
    );
    register(
      'list_namespaces',
      {},
      async () =>
        sql`SELECT n.* FROM namespaces n WHERE EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=${actor.id} AND p.namespace_id=n.id AND p.permission='documents.read')`,
    );
    register(
      'list_events',
      {
        namespace: identifier.optional(),
        since: z.iso.datetime().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      },
      (a) => queryEvents(actor, a),
    );
    register('list_channels', { workspace: identifier }, (a) =>
      listScoped(actor, 'channels', { workspace: String(a.workspace) }),
    );
    register(
      'read_channel',
      {
        channel: identifier,
        limit: z.number().int().min(1).max(100).default(30),
      },
      async (a) => {
        const channel = await channelInfo(
          sql,
          actor,
          String(a.channel),
          'messages.read',
        );
        return sql`SELECT * FROM messages WHERE channel_id=${channel.id} ORDER BY created_at DESC LIMIT ${Number(a.limit)}`;
      },
    );
    register(
      'post_message',
      {
        channel: identifier,
        body: z.string().min(1).max(12000),
        idempotency_key: z.uuid(),
      },
      (a) =>
        postMessage(actor, String(a.channel), {
          body: a.body,
          idempotency_key: a.idempotency_key,
        }),
    );
    register(
      'list_tasks',
      { workspace: identifier, status: z.string().max(40).optional() },
      (a) =>
        listScoped(actor, 'tasks', {
          workspace: String(a.workspace),
          status: a.status as string | undefined,
        }),
    );
    register('create_task', taskInput.shape, (a) => createTask(actor, a));
    register('get_task', { task_id: z.uuid() }, (a) =>
      scopedRow(sql, actor, 'tasks', String(a.task_id), 'tasks.read'),
    );
    register(
      'list_approvals',
      {
        workspace: identifier,
        status: z
          .enum(['pending', 'approved', 'rejected', 'cancelled'])
          .optional(),
      },
      (a) =>
        listScoped(actor, 'approvals', {
          workspace: String(a.workspace),
          status: a.status as string | undefined,
        }),
    );
    register(
      'request_approval',
      approvalInput.omit({ requested_by_agent_id: true }).shape,
      (a) => requestApproval(actor, a),
    );
    register('search_brain', searchInput.shape, (a) => searchBrain(actor, a));
    register('read_brain_item', { workspace_id: z.uuid(), id: z.uuid() }, (a) =>
      readMemory(actor, String(a.workspace_id), String(a.id)),
    );
    register('capture_brain_item', captureInput.shape, (a) =>
      captureBrain(actor, a),
    );
    for (const [type, plural] of [
      ['project', 'projects'],
      ['person', 'people'],
    ] as const) {
      register(
        'list_' + plural,
        { workspace_id: z.uuid(), q: z.string().max(500).default('') },
        (a) => listEntities(actor, type, String(a.workspace_id), String(a.q)),
      );
      register('get_' + type, { workspace_id: z.uuid(), id: z.uuid() }, (a) =>
        entityDetail(actor, type, String(a.workspace_id), String(a.id)),
      );
    }
    register('list_decisions', searchInput.omit({ kind: true }).shape, (a) =>
      searchBrain(actor, { ...a, kind: 'decision' }),
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    // Hijacking bypasses Fastify's onSend path; retain security and CORS headers.
    for (const [name, value] of Object.entries(reply.getHeaders()))
      if (value !== undefined) reply.raw.setHeader(name, value);
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  for (const method of ['GET', 'DELETE'] as const)
    app.route({
      method,
      url: '/mcp',
      handler: async (_req, reply) =>
        reply
          .code(405)
          .header('Allow', 'POST')
          .send({ error: 'Stateless Streamable HTTP accepts POST only.' }),
    });
}
