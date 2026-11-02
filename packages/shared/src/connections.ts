import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql, type Query } from '../../db/src/client.js';
import { type Actor, fail } from './contracts.js';
import { audit, newToken, tokenHash } from './security.js';
import { humanManager } from './brain/access.js';
export const clientKind = z.enum([
  'chatgpt',
  'codex',
  'claude',
  'claude-code',
  'grok',
  'muse',
  'other',
]);
export const connectionInput = z
  .object({
    workspace_id: z.uuid(),
    client_kind: clientKind,
    label: z.string().trim().min(1).max(100),
    access: z.enum(['read', 'propose']).default('propose'),
    expires_in_days: z.number().int().min(1).max(90).default(30),
  })
  .strict();
export const scopeNames = [
  'brain.read',
  'brain.propose',
  'offline_access',
] as const;
export async function listConnections(actor: Actor, workspace: string) {
  await humanManager(sql, actor, workspace);
  return sql`SELECT c.id,c.workspace_id,c.label,c.client_kind,c.auth_method,c.scopes,c.expires_at,c.last_seen_at,c.revoked_at,c.created_at,a.display_name FROM ai_connections c JOIN agents a ON a.id=c.agent_id WHERE c.workspace_id=${workspace} ORDER BY c.created_at DESC LIMIT 200`;
}
export async function createConnectionInTx(
  db: Query,
  actor: Actor,
  data: z.infer<typeof connectionInput>,
  oauth?: { client_id: string; scopes: string[] },
) {
  await humanManager(db, actor, data.workspace_id);
  const scopes = oauth?.scopes ?? [
    'brain.read',
    ...(data.access === 'propose' ? ['brain.propose'] : []),
  ];
  if (
    !scopes.includes('brain.read') ||
    scopes.some((s) => !scopeNames.includes(s as (typeof scopeNames)[number]))
  )
    fail(
      422,
      'invalid_scope',
      'Only Brain read and capture access can be connected.',
    );
  const id = randomUUID();
  const [agent] =
    await db`INSERT INTO agents(slug,display_name,description,role_description,agent_type,status)
 VALUES(${'connected-' + data.client_kind + '-' + id},${data.label},'External AI connection','Scoped Second Brain client','system','idle') RETURNING id`;
  const [connection] =
    await db`INSERT INTO ai_connections(id,workspace_id,agent_id,created_by_user_id,client_kind,label,auth_method,scopes,oauth_client_id,expires_at)
 VALUES(${id},${data.workspace_id},${agent.id},${actor.id},${data.client_kind},${data.label},${oauth ? 'oauth' : 'token'},${scopes},${oauth?.client_id ?? null},now()+${data.expires_in_days}*interval '1 day') RETURNING *`;
  for (const permission of scopes.filter((s) => s !== 'offline_access'))
    await db`INSERT INTO agent_permissions(agent_id,workspace_id,permission) VALUES(${agent.id},${data.workspace_id},${permission})`;
  await audit(
    db,
    actor,
    'connection.created',
    { workspace: data.workspace_id },
    {
      connection_id: id,
      client_kind: data.client_kind,
      auth_method: connection.auth_method,
      scopes,
    },
  );
  return connection;
}
export async function createConnection(actor: Actor, input: unknown) {
  const data = connectionInput.parse(input);
  return sql.begin(async (tx) => {
    const connection = await createConnectionInTx(tx, actor, data);
    const token = newToken();
    await tx`INSERT INTO agent_tokens(agent_id,token_hash,connection_id,expires_at) VALUES(${connection.agent_id},${tokenHash(token)},${connection.id},${connection.expires_at})`;
    return { connection, token };
  });
}
export async function revokeConnectionInTx(
  db: Query,
  actor: Actor,
  id: string,
  workspace?: string,
) {
  const [connection] =
    await db`SELECT * FROM ai_connections WHERE id=${id} ${workspace ? db`AND workspace_id=${workspace}` : db``} FOR UPDATE`;
  if (!connection) fail(404, 'not_found', 'Connection not found.');
  if (workspace) await humanManager(db, actor, workspace);
  await db`UPDATE ai_connections SET revoked_at=coalesce(revoked_at,now()) WHERE id=${id}`;
  await db`UPDATE agent_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE connection_id=${id}`;
  await db`UPDATE oauth_refresh_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE connection_id=${id}`;
  await db`UPDATE agents SET status='disabled',updated_at=now() WHERE id=${connection.agent_id}`;
  await audit(
    db,
    actor,
    'connection.revoked',
    { workspace: connection.workspace_id },
    { connection_id: id },
  );
  return { ok: true };
}
export const revokeConnection = (actor: Actor, workspace: string, id: string) =>
  sql.begin((tx) => revokeConnectionInTx(tx, actor, id, workspace));
export async function rotateConnection(
  actor: Actor,
  workspace: string,
  id: string,
) {
  await humanManager(sql, actor, workspace);
  return sql.begin(async (tx) => {
    const [c] =
      await tx`SELECT * FROM ai_connections WHERE id=${id} AND workspace_id=${workspace} FOR UPDATE`;
    if (!c || c.revoked_at || new Date(c.expires_at).getTime() <= Date.now())
      fail(
        409,
        'inactive_connection',
        'Create a new connection after expiry or revocation.',
      );
    if (c.auth_method !== 'token')
      fail(
        422,
        'oauth_connection',
        'Reconnect this app through its sign-in flow.',
      );
    await tx`UPDATE agent_tokens SET revoked_at=now() WHERE connection_id=${id} AND revoked_at IS NULL`;
    const token = newToken();
    await tx`INSERT INTO agent_tokens(agent_id,token_hash,connection_id,expires_at) VALUES(${c.agent_id},${tokenHash(token)},${id},${c.expires_at})`;
    await audit(
      tx,
      actor,
      'connection.rotated',
      { workspace },
      { connection_id: id },
    );
    return { token };
  });
}
export async function connectionForActor(actor: Actor) {
  if (!actor.connectionId) return null;
  const [c] =
    await sql`SELECT id,workspace_id,label,client_kind,scopes,last_seen_at,expires_at FROM ai_connections WHERE id=${actor.connectionId} AND revoked_at IS NULL AND expires_at>now()`;
  if (!c) fail(401, 'unauthenticated', 'Connection expired or revoked.');
  return c;
}
