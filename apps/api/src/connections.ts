import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  createConnection,
  listConnections,
  revokeConnection,
  rotateConnection,
  connectionInput,
  clientKind,
} from '../../../packages/shared/src/connections.js';
import {
  allSetupGuides,
  setupGuide,
  connectorBundle,
} from '../../../packages/shared/src/connection-setup.js';
import { readConsent, decideConsent, consentInput } from './oauth.js';
import { fail } from '../../../packages/shared/src/contracts.js';
const origin = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
type Route = (
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  summary: string,
  handler: (req: FastifyRequest, reply: FastifyReply) => unknown,
  body?: z.ZodType,
  publicRoute?: boolean,
) => void;
const workspace = (r: FastifyRequest) =>
  z.object({ workspace_id: z.uuid() }).parse(r.query).workspace_id;
const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;
export function registerConnections(route: Route) {
  route(
    'GET',
    '/api/v1/connections',
    'Owner-managed AI connections',
    async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return {
        connections: await listConnections(req.actor, workspace(req)),
        guides: allSetupGuides(origin),
      };
    },
  );
  route(
    'POST',
    '/api/v1/connections',
    'Issue a scoped external AI token once',
    async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return createConnection(req.actor, req.body);
    },
    connectionInput,
  );
  route(
    'POST',
    '/api/v1/connections/:id/revoke',
    'Revoke this connection and every associated credential',
    (req) => revokeConnection(req.actor, workspace(req), id(req)),
    z.object({}).strict(),
  );
  route(
    'POST',
    '/api/v1/connections/:id/rotate',
    'Replace a manual connection credential',
    async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return rotateConnection(req.actor, workspace(req), id(req));
    },
    z.object({}).strict(),
  );
  route(
    'GET',
    '/api/v1/connections/:id/verify',
    'Report real authenticated use rather than assuming installation',
    async (req) => {
      const rows = await listConnections(req.actor, workspace(req));
      const c = rows.find((c) => c.id === id(req));
      if (!c) fail(404, 'not_found', 'Connection not found.');
      return {
        active: !c.revoked_at && new Date(c.expires_at).getTime() > Date.now(),
        last_authenticated_use: c.last_seen_at,
      };
    },
  );
  route(
    'GET',
    '/api/v1/connections/oauth-requests/:request',
    'Human consent details for a pending OAuth request',
    (req) =>
      readConsent(
        req.actor,
        z.object({ request: z.string().min(40).max(100) }).parse(req.params)
          .request,
      ),
  );
  route(
    'POST',
    '/api/v1/connections/oauth-consent',
    'Approve or deny a scoped AI connection',
    async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return decideConsent(req.actor, req.body);
    },
    consentInput,
  );
  route(
    'GET',
    '/api/v1/connections/setup/:client',
    'Public credential-free setup instructions',
    async (req, reply) => {
      const kind = clientKind.parse((req.params as { client: string }).client),
        g = setupGuide(kind, origin);
      reply
        .header('Cache-Control', 'no-store')
        .header('X-Robots-Tag', 'noindex')
        .type('text/plain; charset=utf-8');
      return `# Connect ${g.name} to Vlyntro Brain\n\nMCP URL: ${g.mcp_url}\n\n${g.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n${g.command ? 'Command: ' + g.command + '\n' : ''}\nOptional skill ZIP: ${g.skill_url}\nOptional local plugin ZIP: ${g.plugin_url}\nOfficial client documentation: ${g.docs}\n\nThese packages contain only instructions and MCP configuration, never credentials. Install a skill in the user skill directory supported by your client, or import the local plugin if supported. Keep installation changes scoped to this connector. A chat prompt alone cannot authorize access; finish the owner browser consent. Do not claim all conversations are automatically synced.\n`;
    },
    undefined,
    true,
  );
  for (const [path, plugin] of [
    ['skill', false],
    ['plugin', true],
  ] as const)
    route(
      'GET',
      `/api/v1/connections/${path}.zip`,
      'Download credential-free Brain ' + path,
      async (_req, reply) =>
        reply
          .header('Cache-Control', 'no-store')
          .header(
            'Content-Disposition',
            `attachment; filename="vlyntro-brain-${path}.zip"`,
          )
          .type('application/zip')
          .send(await connectorBundle(origin, plugin)),
      undefined,
      true,
    );
}
