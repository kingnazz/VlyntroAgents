import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Actor } from '../packages/shared/src/contracts.js';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { safeLoginNext } from '../apps/web/src/login-next.js';
let sql: typeof import('../packages/db/src/client.js').sql;
let connections: typeof import('../packages/shared/src/connections.js');
let security: typeof import('../packages/shared/src/security.js');
let app: FastifyInstance,
  base: string,
  workspace: string,
  other: string,
  owner: Actor,
  viewer: Actor,
  cookie: string,
  clientId: string;
const origin = 'http://localhost:3000',
  resource = origin + '/mcp',
  callback = 'http://127.0.0.1:8877/callback';
const headers = () => ({ origin, cookie });
const input = (extra: Record<string, unknown> = {}) => ({
  workspace_id: workspace,
  client_kind: 'codex',
  label: 'Personal Codex',
  access: 'propose',
  expires_in_days: 30,
  ...extra,
});
const verifier = () => randomBytes(32).toString('base64url');
const challenge = (value: string) =>
  createHash('sha256').update(value).digest('base64url');
async function protocol(
  path: string,
  body?: Record<string, string>,
  json?: unknown,
) {
  return fetch(base + path, {
    method: body || json ? 'POST' : 'GET',
    redirect: 'manual',
    headers: body
      ? { 'content-type': 'application/x-www-form-urlencoded' }
      : json
        ? { 'content-type': 'application/json' }
        : {},
    body: body
      ? new URLSearchParams(body)
      : json
        ? JSON.stringify(json)
        : undefined,
  });
}
async function pending(extra: Record<string, string> = {}, client = clientId) {
  const secret = verifier();
  const response = await protocol(
    '/oauth/authorize?' +
      new URLSearchParams({
        client_id: client,
        redirect_uri: callback,
        response_type: 'code',
        code_challenge: challenge(secret),
        code_challenge_method: 'S256',
        scope: 'brain.read brain.propose offline_access',
        resource,
        state: 'state-fixture',
        ...extra,
      }),
  );
  expect(response.status).toBe(302);
  const url = new URL(response.headers.get('location')!);
  return { request: url.searchParams.get('request')!, url, secret };
}
async function consent(request: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/connections/oauth-consent',
    headers: headers(),
    payload: {
      request,
      workspace_id: workspace,
      client_kind: 'codex',
      label: 'OAuth Codex',
      allow_capture: true,
      remember: true,
      decision: 'allow',
      ...extra,
    },
  });
}
async function grant(extra: Record<string, unknown> = {}) {
  const p = await pending();
  const result = await consent(p.request, extra);
  expect(result.statusCode).toBe(200);
  const url = new URL(result.json().redirect),
    code = url.searchParams.get('code')!;
  expect(url.searchParams.get('state')).toBe('state-fixture');
  expect(url.searchParams.get('iss')).toBe(origin);
  return { ...p, code };
}
const exchange = (
  code: string,
  secret: string,
  extra: Record<string, string> = {},
) =>
  protocol('/oauth/token', {
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: secret,
    redirect_uri: callback,
    resource,
    ...extra,
  });
async function tokens(extra: Record<string, unknown> = {}) {
  const g = await grant(extra);
  const result = await exchange(g.code, g.secret);
  expect(result.status).toBe(200);
  return result.json();
}
beforeAll(async () => {
  process.env.DATABASE_URL =
    'postgres://hq:local-development-only@127.0.0.1:55432/hq_connections_test';
  const admin = postgres(
    'postgres://hq:local-development-only@127.0.0.1:55432/hq',
  );
  await admin.unsafe(
    'DROP DATABASE IF EXISTS hq_connections_test WITH (FORCE)',
  );
  await admin.unsafe('CREATE DATABASE hq_connections_test');
  await admin.end();
  ({ sql } = await import('../packages/db/src/client.js'));
  await (await import('../packages/db/src/migrate.js')).migrate();
  await (await import('../packages/db/src/seed.js')).seed();
  connections = await import('../packages/shared/src/connections.js');
  security = await import('../packages/shared/src/security.js');
  workspace = (await sql`SELECT id FROM workspaces WHERE slug='vlyntro'`)[0].id;
  other = (
    await sql`INSERT INTO workspaces(slug,name) VALUES('other-connection','Other connection') RETURNING id`
  )[0].id;
  const user = (
    await sql`INSERT INTO users(email,display_name,password_hash,role) VALUES('connect@example.test','Connection owner','unused','owner') RETURNING id`
  )[0];
  owner = { type: 'user', id: user.id, role: 'owner' };
  viewer = { ...owner, role: 'viewer' };
  const session = security.newToken();
  await sql`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(${owner.id},${security.tokenHash(session)},now()+interval '1 day')`;
  cookie = 'hq_session=' + session;
  app = await (await import('../apps/api/src/app.js')).buildApp();
  base = await app.listen({ host: '127.0.0.1', port: 0 });
  const registered = await protocol('/oauth/register', undefined, {
    client_name: 'SDK test client',
    redirect_uris: [callback],
    token_endpoint_auth_method: 'none',
  });
  expect(registered.status).toBe(201);
  clientId = (await registered.json()).client_id;
});
afterAll(async () => {
  await app?.close();
  await sql?.end();
});
describe('Scoped connections and credential lifecycle', () => {
  it('requires a human manager for creation, listing and rotation', async () => {
    await expect(
      connections.createConnection(viewer, input()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      connections.listConnections(
        { type: 'agent', id: randomUUID() },
        workspace,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const response = await app.inject({
      url: '/api/v1/connections?workspace_id=' + workspace,
    });
    expect(response.statusCode).toBe(401);
  });
  it('creates independent identities with only the requested Brain permissions and hash at rest', async () => {
    const a = await connections.createConnection(owner, input()),
      b = await connections.createConnection(owner, input({ access: 'read' }));
    expect(a.connection.agent_id).not.toBe(b.connection.agent_id);
    const rows =
      await sql`SELECT permission FROM agent_permissions WHERE agent_id=${a.connection.agent_id}`;
    expect(rows.map((r) => r.permission).sort()).toEqual([
      'brain.propose',
      'brain.read',
    ]);
    const stored = (
      await sql`SELECT * FROM agent_tokens WHERE connection_id=${a.connection.id}`
    )[0];
    expect(stored.token_hash).toBe(security.tokenHash(a.token));
    expect(JSON.stringify(stored)).not.toContain(a.token);
    expect(new Date(stored.expires_at).getTime()).toBeGreaterThan(Date.now());
    const list = await app.inject({
      url: '/api/v1/connections?workspace_id=' + workspace,
      headers: headers(),
    });
    expect(list.statusCode).toBe(200);
    expect(list.headers['cache-control']).toContain('no-store');
    expect(list.body).not.toContain(a.token);
    expect(list.body).not.toContain('token_hash');
    const roster = await app.inject({
      url: '/api/v1/agents',
      headers: headers(),
    });
    expect(roster.body).not.toContain(a.connection.agent_id);
  });
  it('rejects indefinite credentials and privileged scopes', async () => {
    await expect(
      connections.createConnection(owner, input({ expires_in_days: 365 })),
    ).rejects.toThrow();
    await expect(
      connections.createConnection(owner, input({ access: 'manage' })),
    ).rejects.toThrow();
  });
  it('rotates a token atomically and revokes the old credential', async () => {
    const c = await connections.createConnection(owner, input());
    const next = await connections.rotateConnection(
      owner,
      workspace,
      c.connection.id,
    );
    await expect(
      security.authenticateToken(sql, c.token),
    ).rejects.toMatchObject({ status: 401 });
    const actor = await security.authenticateToken(sql, next.token);
    expect(actor.connectionId).toBe(c.connection.id);
    await expect(
      security.authorize(sql, actor, 'tasks.read', { workspace }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      security.authorize(sql, actor, 'brain.read', { workspace: other }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('revokes credentials and prevents rotation after revocation', async () => {
    const c = await connections.createConnection(owner, input());
    await connections.revokeConnection(owner, workspace, c.connection.id);
    await expect(
      security.authenticateToken(sql, c.token),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      connections.rotateConnection(owner, workspace, c.connection.id),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('enforces connection and token expiry and the granting owner role', async () => {
    const c = await connections.createConnection(owner, input());
    await sql`UPDATE agent_tokens SET expires_at=now()-interval '1 second' WHERE connection_id=${c.connection.id}`;
    await expect(
      security.authenticateToken(sql, c.token),
    ).rejects.toMatchObject({ status: 401 });
    const d = await connections.createConnection(owner, input());
    await sql`UPDATE ai_connections SET expires_at=now()-interval '1 second' WHERE id=${d.connection.id}`;
    await expect(
      security.authenticateToken(sql, d.token),
    ).rejects.toMatchObject({ status: 401 });
    const e = await connections.createConnection(owner, input());
    await sql`UPDATE users SET role='viewer' WHERE id=${owner.id}`;
    try {
      await expect(
        security.authenticateToken(sql, e.token),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      await sql`UPDATE users SET role='owner' WHERE id=${owner.id}`;
    }
  });
  it('reports no use until authentication and returns 404 for an unknown connection', async () => {
    const c = await connections.createConnection(owner, input());
    const url =
      '/api/v1/connections/' +
      c.connection.id +
      '/verify?workspace_id=' +
      workspace;
    expect(
      (await app.inject({ url, headers: headers() })).json()
        .last_authenticated_use,
    ).toBeNull();
    await security.authenticateToken(sql, c.token);
    expect(
      (await app.inject({ url, headers: headers() })).json()
        .last_authenticated_use,
    ).toBeTruthy();
    expect(
      (
        await app.inject({
          url:
            '/api/v1/connections/' +
            randomUUID() +
            '/verify?workspace_id=' +
            workspace,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(404);
  });
  it('scopes the actual MCP tool inventory, binds workspace and preserves source identity', async () => {
    const c = await connections.createConnection(owner, input()),
      client = new Client({ name: 'connected-test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        requestInit: {
          headers: {
            Authorization: 'Bearer ' + c.token,
            Origin: 'https://ai-client.example',
          },
        },
      }),
    );
    try {
      const tools = (await client.listTools()).tools.map((t) => t.name);
      expect(tools).toContain('get_brain_connection');
      expect(tools).toContain('capture_brain_item');
      expect(tools).not.toContain('write_state');
      expect(tools).not.toContain('create_task');
      const identity = await client.callTool({
        name: 'get_brain_connection',
        arguments: {},
      });
      expect(JSON.stringify(identity)).toContain(workspace);
      const result = await client.callTool({
        name: 'search_brain',
        arguments: { query: 'fixture', workspace_id: other },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain('workspace_mismatch');
      const accepted = await client.callTool({
        name: 'capture_brain_item',
        arguments: {
          raw_text: 'A harmless connection test observation.',
          idempotency_key: randomUUID(),
        },
      });
      expect(accepted.isError).not.toBe(true);
      expect(
        (
          await sql`SELECT captured_by_id FROM capture_inbox WHERE captured_by_id=${c.connection.agent_id}`
        )[0].captured_by_id,
      ).toBe(c.connection.agent_id);
    } finally {
      await client.close();
    }
  });
  it('read-only MCP clients cannot discover or call capture tools', async () => {
    const c = await connections.createConnection(
        owner,
        input({ access: 'read' }),
      ),
      client = new Client({ name: 'read-test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        requestInit: { headers: { Authorization: 'Bearer ' + c.token } },
      }),
    );
    try {
      expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
        'capture_brain_item',
      );
    } finally {
      await client.close();
    }
  });
});
describe('OAuth protocol and human authorization', () => {
  it('publishes issuer/resource discovery and an unauthenticated MCP challenge, including CORS preflight', async () => {
    const meta = await protocol('/.well-known/oauth-authorization-server');
    const m = await meta.json();
    expect(m.issuer).toBe(origin);
    expect(m.code_challenge_methods_supported).toEqual(['S256']);
    expect(
      (
        await (
          await protocol('/.well-known/oauth-protected-resource/mcp')
        ).json()
      ).resource,
    ).toBe(resource);
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { origin: 'https://ai-client.example' },
      payload: {},
    });
    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toContain(
      '/.well-known/oauth-protected-resource/mcp',
    );
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/mcp',
      headers: { origin: 'https://ai-client.example' },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('*');
    expect(
      preflight.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });
  it.each([
    'http://evil.example/callback',
    'https://example.test/callback#fragment',
    'https://user:password@example.test/callback',
  ])('rejects unsafe registration callback %s', async (redirect) => {
    const r = await protocol('/oauth/register', undefined, {
      redirect_uris: [redirect],
      token_endpoint_auth_method: 'none',
    });
    expect(r.status).toBe(400);
  });
  it('rejects secret-based registration and preserves no untrusted metadata URL', async () => {
    expect(
      (
        await protocol('/oauth/register', undefined, {
          redirect_uris: [callback],
          token_endpoint_auth_method: 'client_secret_post',
        })
      ).status,
    ).toBe(400);
    const r = await protocol('/oauth/register', undefined, {
      client_name: 'Unverified client',
      redirect_uris: [callback],
      token_endpoint_auth_method: 'none',
      client_uri: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.client_secret).toBeUndefined();
    expect(body.client_uri).toBeUndefined();
  });
  it('requires an exact callback, S256 and the correct resource; it cannot expand permissions', async () => {
    const bad = await protocol(
      '/oauth/authorize?' +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: 'https://evil.example/callback',
          response_type: 'code',
        }),
    );
    expect(bad.status).toBe(400);
    expect(bad.headers.get('location')).toBeNull();
  });
  const invalidAuthorizations: Record<string, string>[] = [
    { code_challenge_method: 'plain' },
    { resource: 'https://elsewhere.test/mcp' },
    { scope: 'brain.read brain.write' },
  ];
  it.each(invalidAuthorizations)(
    'rejects unsafe authorization parameters %j',
    async (extra) => {
      const p = await pending(extra);
      expect(p.request).toBeNull();
      expect(p.url.searchParams.has('error')).toBe(true);
      expect(p.url.searchParams.get('iss')).toBe(origin);
    },
  );
  it('keeps the request pending until same-origin human consent and honors denial', async () => {
    const p = await pending();
    expect(p.url.pathname).toBe('/connect/authorize');
    expect(p.request).toBeTruthy();
    await expect(
      (await import('../apps/api/src/oauth.js')).readConsent(viewer, p.request),
    ).rejects.toMatchObject({ status: 403 });
    const noOrigin = await app.inject({
      method: 'POST',
      url: '/api/v1/connections/oauth-consent',
      headers: { cookie },
      payload: {},
    });
    expect(noOrigin.statusCode).toBe(403);
    const result = await consent(p.request, { decision: 'deny' });
    expect(new URL(result.json().redirect).searchParams.get('error')).toBe(
      'access_denied',
    );
    expect((await consent(p.request)).statusCode).toBe(404);
  });
  it('requires an unused, unexpired pending request', async () => {
    const p = await pending();
    await sql`UPDATE oauth_requests SET expires_at=now()-interval '1 second' WHERE request_hash=${security.tokenHash(p.request)}`;
    expect((await consent(p.request)).statusCode).toBe(404);
  });
  it('exchanges a code only with its verifier, callback, client and resource', async () => {
    const g = await grant();
    expect((await exchange(g.code, verifier())).status).toBe(400);
    expect(
      (await exchange(g.code, g.secret, { redirect_uri: callback + '/other' }))
        .status,
    ).toBe(400);
    expect(
      (await exchange(g.code, g.secret, { client_id: 'unknown-client' }))
        .status,
    ).toBe(400);
    expect(
      (
        await exchange(g.code, g.secret, {
          resource: 'https://elsewhere.test/mcp',
        })
      ).status,
    ).toBe(400);
    const success = await exchange(g.code, g.secret);
    expect(success.status).toBe(200);
    const t = await success.json();
    expect(t.expires_in).toBeLessThanOrEqual(3600);
    expect(t.refresh_token).toBeTruthy();
    expect((await exchange(g.code, g.secret)).status).toBe(400);
    const [stored] =
      await sql`SELECT * FROM agent_tokens WHERE token_hash=${security.tokenHash(t.access_token)}`;
    expect(stored.resource).toBe(resource);
    expect(JSON.stringify(stored)).not.toContain(t.access_token);
  });
  it('rejects expired authorization codes', async () => {
    const g = await grant();
    await sql`UPDATE oauth_codes SET expires_at=now()-interval '1 second' WHERE code_hash=${security.tokenHash(g.code)}`;
    expect((await exchange(g.code, g.secret)).status).toBe(400);
  });
  it('honors read-only, nonpersistent consent and binds OAuth access to MCP', async () => {
    const t = await tokens({ allow_capture: false, remember: false });
    expect(t.scope).toBe('brain.read');
    expect(t.refresh_token).toBeUndefined();
    const rest = await app.inject({
      url: '/api/v1/brain/search?workspace_id=' + workspace + '&query=fixture',
      headers: { authorization: 'Bearer ' + t.access_token },
    });
    expect(rest.statusCode).toBe(401);
    const info = await (
      await import('../apps/api/src/oauth.js')
    ).brainOAuthProvider.verifyAccessToken(t.access_token);
    expect(info.clientId).toBe(clientId);
    const client = new Client({ name: 'oauth-read-test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        requestInit: { headers: { Authorization: 'Bearer ' + t.access_token } },
      }),
    );
    try {
      expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
        'capture_brain_item',
      );
      expect(
        (await client.callTool({ name: 'get_brain_connection', arguments: {} }))
          .isError,
      ).not.toBe(true);
    } finally {
      await client.close();
    }
  });
  it('rotates refresh tokens and revokes the connection on a replay', async () => {
    const t = await tokens();
    const fresh = await protocol('/oauth/token', {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: t.refresh_token,
      resource,
    });
    expect(fresh.status).toBe(200);
    const next = await fresh.json();
    expect(next.refresh_token).not.toBe(t.refresh_token);
    expect(
      (
        await protocol('/oauth/token', {
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: t.refresh_token,
          resource,
        })
      ).status,
    ).toBe(400);
    await expect(
      security.authenticateToken(sql, next.access_token),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('allows narrowing refresh scopes, revokes old access and forbids expansion', async () => {
    const t = await tokens();
    expect(
      (
        await protocol('/oauth/token', {
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: t.refresh_token,
          resource,
          scope: 'brain.read brain.write',
        })
      ).status,
    ).toBe(400);
    const response = await protocol('/oauth/token', {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: t.refresh_token,
      resource,
      scope: 'brain.read offline_access',
    });
    expect(response.status).toBe(200);
    const next = await response.json();
    expect(next.scope).toBe('brain.read offline_access');
    await expect(
      security.authenticateToken(sql, t.access_token),
    ).rejects.toMatchObject({ status: 401 });
    const actor = await security.authenticateToken(sql, next.access_token);
    await expect(
      security.authorize(sql, actor, 'brain.propose', { workspace }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('supports owner revocation and public-client revocation of issued OAuth credentials', async () => {
    const t = await tokens();
    const result = await protocol('/oauth/revoke', {
      client_id: clientId,
      token: t.refresh_token,
    });
    expect(result.status).toBe(200);
    await expect(
      security.authenticateToken(sql, t.access_token),
    ).rejects.toMatchObject({ status: 401 });
  });
});
describe('OAuth concurrency and HTTP boundaries', () => {
  it('does not let a legacy unbound credential bypass a connected identity lifecycle', async () => {
    const c = await connections.createConnection(owner, input()),
      token = security.newToken();
    await sql`INSERT INTO agent_tokens(agent_id,token_hash) VALUES(${c.connection.agent_id},${security.tokenHash(token)})`;
    await expect(security.authenticateToken(sql, token)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('binds a code to the actual registered client and exchanges it only once under concurrency', async () => {
    const registered = await protocol('/oauth/register', undefined, {
      client_name: 'Other registered client',
      redirect_uris: [callback],
      token_endpoint_auth_method: 'none',
    });
    expect(registered.status).toBe(201);
    const otherClient = (await registered.json()).client_id;
    const g = await grant();
    expect(
      (await exchange(g.code, g.secret, { client_id: otherClient })).status,
    ).toBe(400);
    const responses = await Promise.all([
      exchange(g.code, g.secret),
      exchange(g.code, g.secret),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
  });
  it('cannot refresh a grant bound to an old issuer/resource', async () => {
    const t = await tokens();
    await sql`UPDATE oauth_refresh_tokens SET resource='https://old.example/mcp' WHERE token_hash=${security.tokenHash(t.refresh_token)}`;
    expect(
      (
        await protocol('/oauth/token', {
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: t.refresh_token,
          resource,
        })
      ).status,
    ).toBe(400);
  });
  it('serializes concurrent owner revocation and refresh without leaving a valid credential', async () => {
    const t = await tokens(),
      actor = await security.authenticateToken(sql, t.access_token);
    const [refresh] = await Promise.all([
      protocol('/oauth/token', {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: t.refresh_token,
        resource,
      }),
      connections.revokeConnection(owner, workspace, actor.connectionId!),
    ]);
    expect([200, 400]).toContain(refresh.status);
    await expect(
      security.authenticateToken(sql, t.access_token),
    ).rejects.toMatchObject({ status: 401 });
    if (refresh.status === 200)
      await expect(
        security.authenticateToken(sql, (await refresh.json()).access_token),
      ).rejects.toMatchObject({ status: 401 });
  });
  it('retains CORS and security headers on an authenticated MCP response', async () => {
    const c = await connections.createConnection(owner, input());
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: 'Bearer ' + c.token,
        origin: 'https://ai-client.example',
        accept: 'application/json, text/event-stream',
      },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
describe('Safe setup artifacts and return routes', () => {
  it('serves a credential-free, valid ZIP with a skill and remote MCP configuration', async () => {
    const guide = await app.inject({ url: '/api/v1/connections/setup/codex' });
    expect(guide.statusCode).toBe(200);
    expect(guide.body).toContain('codex mcp login');
    expect(guide.body).not.toContain('token_hash');
    const zip = await app.inject({ url: '/api/v1/connections/plugin.zip' });
    expect(zip.statusCode).toBe(200);
    const directory = await mkdtemp(tmpdir() + '/vlyntro-connector-');
    try {
      await writeFile(directory + '/plugin.zip', zip.rawPayload);
      execFileSync('unzip', ['-t', directory + '/plugin.zip'], {
        stdio: 'pipe',
      });
      const config = execFileSync(
        'unzip',
        ['-p', directory + '/plugin.zip', '.mcp.json'],
        { encoding: 'utf8' },
      );
      expect(JSON.parse(config).mcpServers['vlyntro-brain'].url).toBe(resource);
      const skill = execFileSync(
        'unzip',
        ['-p', directory + '/plugin.zip', 'skills/vlyntro-brain/SKILL.md'],
        { encoding: 'utf8' },
      );
      expect(skill).toContain('name: vlyntro-brain');
      expect(skill).not.toContain('{{MCP_URL}}');
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/api/v1/auth/logout',
    ['/app'],
    '/%5cevil.test',
  ])('rejects an unsafe post-login return %j', (value) => {
    expect(safeLoginNext(value)).toBe('/app');
  });
  it('preserves an approved consent return path', () => {
    expect(safeLoginNext('/connect/authorize?request=abc')).toBe(
      '/connect/authorize?request=abc',
    );
  });
});
