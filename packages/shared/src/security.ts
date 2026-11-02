import { createHash, randomBytes } from 'node:crypto';
import type { Actor } from './contracts.js';
import { fail } from './contracts.js';
import type { Query } from '../../db/src/client.js';
export const tokenHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const safeText = (value: string) =>
  value.replace(/\u2014/g, ',').slice(0, 16000);
export async function authorize(
  db: Query,
  actor: Actor,
  permission: string,
  scope: { workspace?: string; namespace?: string },
) {
  if (
    actor.connectionId &&
    !['brain.read', 'brain.propose'].includes(permission)
  )
    fail(
      403,
      'scope_required',
      'AI connections can only read Brain context and submit captures.',
    );
  if (actor.type === 'user') {
    if (
      actor.role === 'owner' ||
      actor.role === 'admin' ||
      (actor.role === 'viewer' && permission.endsWith('.read'))
    )
      return;
    fail(403, 'forbidden', 'This action requires an owner or administrator.');
  }
  if (actor.type === 'system')
    fail(403, 'forbidden', 'System actors cannot use public operations.');
  const rows =
    await db`SELECT 1 FROM agent_permissions WHERE agent_id=${actor.id} AND permission=${permission}
  AND ((${scope.namespace ?? null}::text IS NOT NULL AND namespace_id=${scope.namespace ?? null})
   OR (${scope.workspace ?? null}::uuid IS NOT NULL AND workspace_id=${scope.workspace ?? null} AND namespace_id IS NULL)) LIMIT 1`;
  if (!rows.length)
    fail(403, 'scope_required', `Missing permission: ${permission}`);
}
export async function audit(
  db: Query,
  actor: Actor,
  action: string,
  scope: { workspace?: string; namespace?: string; key?: string },
  payload: Record<string, unknown> = {},
) {
  await db`INSERT INTO events(workspace_id,namespace_id,key,action,actor_type,actor_id,payload)
 VALUES(${scope.workspace ?? null},${scope.namespace ?? null},${scope.key ?? null},${action},${actor.type},${actor.id},${db.json(payload as never)})`;
}
export async function authenticateToken(
  db: Query,
  token: string,
  resource?: string,
): Promise<Actor> {
  const [row] =
    await db`SELECT a.id,a.slug,t.id AS token_id,t.connection_id,t.resource FROM agent_tokens t JOIN agents a ON a.id=t.agent_id LEFT JOIN ai_connections c ON c.id=t.connection_id AND c.agent_id=a.id LEFT JOIN users u ON u.id=c.created_by_user_id
    WHERE t.token_hash=${tokenHash(token)} AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>now()) AND a.status<>'disabled'
    AND (t.connection_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM ai_connections ext WHERE ext.agent_id=a.id))
    AND (t.connection_id IS NULL OR (c.revoked_at IS NULL AND c.expires_at>now() AND u.role IN ('owner','admin')))`;
  if (!row)
    return fail(401, 'unauthenticated', 'Invalid or revoked agent token.');
  if (resource !== undefined && row.resource && row.resource !== resource)
    fail(
      401,
      'invalid_resource',
      'This OAuth token is only valid for the Brain MCP endpoint.',
    );
  await db`UPDATE agent_tokens SET last_used_at=now() WHERE id=${row.token_id}`;
  if (row.connection_id)
    await db`UPDATE ai_connections SET last_seen_at=now() WHERE id=${row.connection_id}`;
  return {
    type: 'agent',
    id: row.id,
    slug: row.slug,
    tokenId: row.token_id,
    ...(row.connection_id ? { connectionId: row.connection_id } : {}),
    ...(row.resource ? { oauthResource: row.resource } : {}),
  };
}
