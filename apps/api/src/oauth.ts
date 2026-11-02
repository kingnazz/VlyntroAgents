import type { FastifyInstance } from 'fastify';
import middie from '@fastify/middie';
import express from 'express';
import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  authorizationHandler,
  redirectUriMatches,
} from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { z } from 'zod';
import { sql, type Query } from '../../../packages/db/src/client.js';
import { type Actor, fail } from '../../../packages/shared/src/contracts.js';
import {
  audit,
  newToken,
  tokenHash,
} from '../../../packages/shared/src/security.js';
import {
  clientKind,
  createConnectionInTx,
  revokeConnectionInTx,
  scopeNames,
} from '../../../packages/shared/src/connections.js';
const issuer = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
export const brainResource = issuer + '/mcp';
const protocolPaths = [
  '/oauth/authorize',
  '/oauth/token',
  '/oauth/register',
  '/oauth/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
];
export const isOAuthProtocolPath = (path: string) =>
  protocolPaths.includes(path);
const validRedirect = (value: string) => {
  try {
    const u = new URL(value);
    return (
      !u.username &&
      !u.password &&
      !u.hash &&
      value.length <= 2048 &&
      (u.protocol === 'https:' ||
        (u.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)))
    );
  } catch {
    return false;
  }
};
function scopesOf(scopes?: string[]) {
  const values = scopes?.length
    ? [...new Set(scopes)]
    : ['brain.read', 'brain.propose', 'offline_access'];
  if (
    !values.includes('brain.read') ||
    values.some((s) => !scopeNames.includes(s as (typeof scopeNames)[number]))
  )
    throw new InvalidScopeError(
      'Choose brain.read, optional brain.propose and offline_access.',
    );
  return values;
}
function validResource(resource?: URL | string) {
  if (resource && String(resource) !== brainResource)
    throw new InvalidRequestError(
      'This authorization is only for the Vlyntro Brain MCP resource.',
    );
}
const clientsStore: OAuthServerProvider['clientsStore'] = {
  async getClient(clientId) {
    const [row] =
      await sql`SELECT metadata FROM oauth_clients WHERE client_id=${clientId}`;
    return row?.metadata as OAuthClientInformationFull | undefined;
  },
  async registerClient(client) {
    if (client.token_endpoint_auth_method !== 'none')
      throw new InvalidClientMetadataError(
        'Register as a public client with token_endpoint_auth_method=none and S256 PKCE.',
      );
    if (
      !client.redirect_uris.length ||
      client.redirect_uris.length > 10 ||
      client.redirect_uris.some((uri) => !validRedirect(uri))
    )
      throw new InvalidClientMetadataError(
        'Use HTTPS or a loopback HTTP callback, without fragments or credentials.',
      );
    if (
      client.response_types?.some((t) => t !== 'code') ||
      client.grant_types?.some(
        (t) => !['authorization_code', 'refresh_token'].includes(t),
      )
    )
      throw new InvalidClientMetadataError(
        'Only authorization code and refresh grants are supported.',
      );
    const [count] = await sql`SELECT count(*)::int AS n FROM oauth_clients`;
    if (count.n >= 1000)
      throw new InvalidClientMetadataError(
        'Registration capacity reached. Contact the workspace owner.',
      );
    const info: OAuthClientInformationFull = {
      client_id: crypto.randomUUID(),
      client_name: String(client.client_name ?? 'AI app').slice(0, 100),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: scopesOf(client.scope?.split(' ').filter(Boolean)).join(' '),
    };
    // Never fetch caller-controlled client metadata URLs or store a plaintext client secret.
    await sql`INSERT INTO oauth_clients(client_id,client_name,metadata) VALUES(${info.client_id},${info.client_name!},${sql.json(info as never)})`;
    return info;
  },
};
async function issueTokens(
  tx: Query,
  connection: Record<string, unknown>,
  clientId: string,
  scopes: string[],
  refresh = true,
): Promise<OAuthTokens> {
  const access = newToken();
  await tx`INSERT INTO agent_tokens(agent_id,token_hash,connection_id,expires_at,resource) VALUES(${String(connection.agent_id)},${tokenHash(access)},${String(connection.id)},least(now()+interval '1 hour',${connection.expires_at as Date}),${brainResource})`;
  const result: OAuthTokens = {
    access_token: access,
    token_type: 'Bearer',
    expires_in: Math.min(
      3600,
      Math.floor(
        (new Date(String(connection.expires_at)).getTime() - Date.now()) / 1000,
      ),
    ),
    scope: scopes.join(' '),
  };
  if (refresh && scopes.includes('offline_access')) {
    const token = newToken();
    await tx`INSERT INTO oauth_refresh_tokens(token_hash,connection_id,client_id,resource,scopes,expires_at) VALUES(${tokenHash(token)},${String(connection.id)},${clientId},${brainResource},${scopes},least(now()+interval '30 days',${connection.expires_at as Date}))`;
    result.refresh_token = token;
  }
  return result;
}
async function activeConnection(tx: Query, id: string) {
  const [c] =
    await tx`SELECT c.* FROM ai_connections c JOIN agents a ON a.id=c.agent_id JOIN users u ON u.id=c.created_by_user_id WHERE c.id=${id} AND c.revoked_at IS NULL AND c.expires_at>now() AND a.status<>'disabled' AND u.role IN ('owner','admin') FOR UPDATE OF c`;
  if (!c)
    throw new InvalidGrantError(
      'Connection expired or revoked. Connect again.',
    );
  return c;
}
export const brainOAuthProvider: OAuthServerProvider = {
  clientsStore,
  async authorize(client, params, response) {
    validResource(params.resource);
    const scopes = scopesOf(params.scopes);
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge) ||
      (params.state?.length ?? 0) > 2048
    )
      throw new InvalidRequestError(
        'A valid S256 challenge and bounded state are required.',
      );
    const request = newToken();
    await sql.begin(async (tx) => {
      await tx`DELETE FROM oauth_requests WHERE expires_at<now()-interval '1 day'`;
      const [count] =
        await tx`SELECT count(*)::int AS n FROM oauth_requests WHERE client_id=${client.client_id} AND expires_at>now()`;
      if (count.n >= 20)
        throw new InvalidRequestError(
          'Too many pending authorizations for this client.',
        );
      await tx`INSERT INTO oauth_requests(request_hash,client_id,redirect_uri,code_challenge,state,scopes,resource,expires_at) VALUES(${tokenHash(request)},${client.client_id},${params.redirectUri},${params.codeChallenge},${params.state ?? null},${scopes},${brainResource},now()+interval '10 minutes')`;
    });
    response.redirect(302, issuer + '/connect/authorize?request=' + request);
  },
  async challengeForAuthorizationCode(client, code) {
    const [row] =
      await sql`SELECT code_challenge FROM oauth_codes WHERE code_hash=${tokenHash(code)} AND client_id=${client.client_id} AND resource=${brainResource} AND expires_at>now() AND consumed_at IS NULL`;
    if (!row)
      throw new InvalidGrantError('Invalid or expired authorization code.');
    return row.code_challenge;
  },
  async exchangeAuthorizationCode(
    client,
    code,
    _verifier,
    redirectUri,
    resource,
  ) {
    validResource(resource);
    return sql.begin(async (tx) => {
      const [row] =
        await tx`SELECT * FROM oauth_codes WHERE code_hash=${tokenHash(code)} AND client_id=${client.client_id} AND resource=${brainResource} AND expires_at>now() AND consumed_at IS NULL FOR UPDATE`;
      if (!row || redirectUri !== row.redirect_uri)
        throw new InvalidGrantError(
          'Authorization code or callback does not match.',
        );
      const c = await activeConnection(tx, row.connection_id);
      await tx`UPDATE oauth_codes SET consumed_at=now() WHERE code_hash=${row.code_hash}`;
      const tokens = await issueTokens(tx, c, client.client_id, row.scopes);
      await audit(
        tx,
        { type: 'agent', id: c.agent_id },
        'connection.authorized',
        { workspace: c.workspace_id },
        { connection_id: c.id },
      );
      return tokens;
    });
  },
  async exchangeRefreshToken(client, token, scopes, resource) {
    validResource(resource);
    const result = await sql.begin(async (tx) => {
      const [lookup] =
        await tx`SELECT connection_id FROM oauth_refresh_tokens WHERE token_hash=${tokenHash(token)} AND client_id=${client.client_id} AND resource=${brainResource}`;
      if (!lookup)
        throw new InvalidGrantError('Refresh token expired or invalid.');
      // Match owner revocation's lock order: connection before its credentials.
      const c = await activeConnection(tx, lookup.connection_id);
      const [r] =
        await tx`SELECT * FROM oauth_refresh_tokens WHERE token_hash=${tokenHash(token)} AND client_id=${client.client_id} FOR UPDATE`;
      if (!r || new Date(r.expires_at).getTime() <= Date.now())
        throw new InvalidGrantError('Refresh token expired or invalid.');
      if (r.used_at || r.revoked_at) {
        await revokeConnectionInTx(
          tx,
          { type: 'system', id: 'oauth-replay' },
          c.id,
        );
        return null;
      }
      if (
        scopes?.some((s) => !r.scopes.includes(s)) ||
        (scopes && !scopes.includes('brain.read'))
      )
        throw new InvalidScopeError(
          'Refreshing cannot expand scopes or remove brain.read.',
        );
      // A narrower refresh request narrows the whole connection; existing access tokens are revoked.
      const granted = scopes ?? r.scopes;
      if (scopes) {
        await tx`UPDATE ai_connections SET scopes=${granted} WHERE id=${c.id}`;
        await tx`DELETE FROM agent_permissions WHERE agent_id=${c.agent_id} AND permission<>ALL(${granted}::text[])`;
        await tx`UPDATE agent_tokens SET revoked_at=now() WHERE connection_id=${c.id} AND revoked_at IS NULL`;
      }
      await tx`UPDATE oauth_refresh_tokens SET used_at=now(),revoked_at=now() WHERE token_hash=${r.token_hash}`;
      return issueTokens(tx, c, client.client_id, granted);
    });
    if (!result)
      throw new InvalidGrantError(
        'Refresh token was already used. Connection revoked; sign in again.',
      );
    return result;
  },
  async verifyAccessToken(token) {
    const [row] =
      await sql`SELECT c.oauth_client_id,c.scopes,t.expires_at FROM agent_tokens t JOIN ai_connections c ON c.id=t.connection_id JOIN agents a ON a.id=c.agent_id JOIN users u ON u.id=c.created_by_user_id WHERE t.token_hash=${tokenHash(token)} AND t.resource=${brainResource} AND t.revoked_at IS NULL AND t.expires_at>now() AND c.revoked_at IS NULL AND c.expires_at>now() AND a.status<>'disabled' AND u.role IN ('owner','admin')`;
    if (!row) throw new InvalidTokenError('Token expired or invalid.');
    return {
      token,
      clientId: String(row.oauth_client_id),
      scopes: row.scopes,
      expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000),
      resource: new URL(brainResource),
    };
  },
  async revokeToken(client, request) {
    await sql.begin(async (tx) => {
      const [r] =
        await tx`SELECT c.id FROM ai_connections c WHERE c.oauth_client_id=${client.client_id} AND (EXISTS(SELECT 1 FROM oauth_refresh_tokens r WHERE r.connection_id=c.id AND r.token_hash=${tokenHash(request.token)}) OR EXISTS(SELECT 1 FROM agent_tokens t WHERE t.connection_id=c.id AND t.token_hash=${tokenHash(request.token)})) FOR UPDATE`;
      if (r)
        await revokeConnectionInTx(
          tx,
          { type: 'system', id: 'oauth-revoke' },
          r.id,
        );
    });
  },
};
export async function readConsent(actor: Actor, request: string) {
  if (actor.type !== 'user' || !['owner', 'admin'].includes(actor.role ?? ''))
    fail(
      403,
      'human_required',
      'Only a human owner or administrator may connect an AI.',
    );
  const [row] =
    await sql`SELECT r.scopes,r.redirect_uri,r.resource,c.client_name,r.expires_at FROM oauth_requests r JOIN oauth_clients c ON c.client_id=r.client_id WHERE r.request_hash=${tokenHash(request)} AND r.resource=${brainResource} AND r.expires_at>now() AND r.consumed_at IS NULL`;
  if (!row)
    fail(
      404,
      'expired_request',
      'This connection request expired or was already used. Start again in your AI app.',
    );
  return row;
}
export const consentInput = z
  .object({
    request: z.string().min(40).max(100),
    workspace_id: z.uuid(),
    client_kind: clientKind,
    label: z.string().trim().min(1).max(100),
    allow_capture: z.boolean(),
    remember: z.boolean().default(true),
    decision: z.enum(['allow', 'deny']),
  })
  .strict();
export async function decideConsent(actor: Actor, input: unknown) {
  const data = consentInput.parse(input);
  await readConsent(actor, data.request);
  return sql.begin(async (tx) => {
    const [r] =
      await tx`SELECT * FROM oauth_requests WHERE request_hash=${tokenHash(data.request)} AND resource=${brainResource} AND expires_at>now() AND consumed_at IS NULL FOR UPDATE`;
    if (!r)
      fail(409, 'consent_used', 'This connection request was already used.');
    const client = await clientsStore.getClient(r.client_id);
    if (
      !client ||
      !client.redirect_uris.some((uri) =>
        redirectUriMatches(r.redirect_uri, uri),
      )
    )
      fail(
        422,
        'invalid_callback',
        'Callback no longer matches the registered client.',
      );
    const callback = new URL(r.redirect_uri);
    callback.searchParams.set('iss', issuer);
    if (r.state) callback.searchParams.set('state', r.state);
    await tx`UPDATE oauth_requests SET consumed_at=now() WHERE request_hash=${r.request_hash}`;
    if (data.decision === 'deny') {
      callback.searchParams.set('error', 'access_denied');
      await audit(tx, actor, 'connection.denied', {}, {});
      return { redirect: callback.href };
    }
    const scopes = r.scopes.filter(
      (s: string) =>
        s === 'brain.read' ||
        (s === 'brain.propose' && data.allow_capture) ||
        (s === 'offline_access' && data.remember),
    );
    const c = await createConnectionInTx(
      tx,
      actor,
      {
        workspace_id: data.workspace_id,
        client_kind: data.client_kind,
        label: data.label,
        access: scopes.includes('brain.propose') ? 'propose' : 'read',
        expires_in_days: 90,
      },
      { client_id: r.client_id, scopes },
    );
    const code = newToken();
    await tx`INSERT INTO oauth_codes(code_hash,connection_id,client_id,redirect_uri,code_challenge,resource,scopes,expires_at) VALUES(${tokenHash(code)},${c.id},${r.client_id},${r.redirect_uri},${r.code_challenge},${r.resource},${scopes},now()+interval '2 minutes')`;
    callback.searchParams.set('code', code);
    return { redirect: callback.href };
  });
}
export async function registerOAuth(app: FastifyInstance) {
  await app.register(middie);
  const provider = brainOAuthProvider;
  // SDK handlers require Express request/response methods. Mount a full app,
  // rather than a bare Router, at the Fastify middleware boundary.
  const oauth = express();
  oauth.disable('x-powered-by');
  oauth.set('trust proxy', false);
  oauth.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  const validation = { xForwardedForHeader: false };
  oauth.use(
    '/register',
    clientRegistrationHandler({
      clientsStore,
      rateLimit: { max: 20, windowMs: 3600000, validate: validation },
    }),
  );
  const authorize = authorizationHandler({
    provider,
    rateLimit: { validate: validation },
  });
  oauth.use('/authorize', (req, res, next) => {
    const redirect = res.redirect.bind(res);
    // RFC 9207 applies to error redirects as well as successful consent.
    res.redirect = ((statusOrUrl: number | string, location?: string) => {
      const url = new URL(
        typeof statusOrUrl === 'string' ? statusOrUrl : location!,
      );
      url.searchParams.set('iss', issuer);
      return redirect(
        typeof statusOrUrl === 'number' ? statusOrUrl : 302,
        url.href,
      );
    }) as typeof res.redirect;
    authorize(req, res, next);
  });
  oauth.use(
    '/token',
    tokenHandler({ provider, rateLimit: { validate: validation } }),
  );
  oauth.use(
    '/revoke',
    revocationHandler({ provider, rateLimit: { validate: validation } }),
  );
  app.use('/oauth', oauth);
  const metadata = {
    issuer,
    authorization_endpoint: issuer + '/oauth/authorize',
    token_endpoint: issuer + '/oauth/token',
    registration_endpoint: issuer + '/oauth/register',
    revocation_endpoint: issuer + '/oauth/revoke',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [...scopeNames],
    authorization_response_iss_parameter_supported: true,
  };
  const resource = {
    resource: brainResource,
    authorization_servers: [issuer],
    scopes_supported: [...scopeNames],
    resource_name: 'Vlyntro Second Brain',
    bearer_methods_supported: ['header'],
  };
  for (const [path, value] of [
    ['/.well-known/oauth-authorization-server', metadata],
    ['/.well-known/oauth-protected-resource', resource],
    ['/.well-known/oauth-protected-resource/mcp', resource],
  ] as const)
    app.get(path, async (_req, reply) =>
      reply
        .header('Cache-Control', 'no-store')
        .header('Access-Control-Allow-Origin', '*')
        .send(value),
    );
}
