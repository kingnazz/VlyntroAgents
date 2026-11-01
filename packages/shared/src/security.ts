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
): Promise<Actor> {
  const [row] =
    await db`SELECT a.id,a.slug,t.id AS token_id FROM agent_tokens t JOIN agents a ON a.id=t.agent_id WHERE t.token_hash=${tokenHash(token)} AND t.revoked_at IS NULL AND a.status<>'disabled'`;
  if (!row)
    return fail(401, 'unauthenticated', 'Invalid or revoked agent token.');
  await db`UPDATE agent_tokens SET last_used_at=now() WHERE id=${row.token_id}`;
  return { type: 'agent', id: row.id, slug: row.slug, tokenId: row.token_id };
}
