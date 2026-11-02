import { sql } from '../packages/db/src/client.js';
import { newToken, tokenHash, audit } from '../packages/shared/src/security.js';
const [action, slug] = process.argv.slice(2);
try {
  if (!['create', 'rotate', 'revoke'].includes(action) || !slug)
    throw new Error('Usage: agent:token:create|rotate|revoke <slug>');
  if (
    action !== 'revoke' &&
    !process.stdout.isTTY &&
    !process.env.TOKEN_OUTPUT_ACK
  )
    throw new Error(
      'Use an interactive terminal or TOKEN_OUTPUT_ACK=1 with secure output redirection.',
    );
  const token = newToken();
  await sql.begin(async (tx) => {
    const [agent] =
      await tx`SELECT id FROM agents WHERE slug=${slug} FOR UPDATE`;
    if (!agent) throw new Error('Agent not found');
    if (
      (await tx`SELECT 1 FROM ai_connections WHERE agent_id=${agent.id}`).length
    )
      throw new Error(
        'Manage external AI credentials in Connect your AI; this CLI is for operational agents.',
      );
    if (action === 'rotate' || action === 'revoke')
      await tx`UPDATE agent_tokens SET revoked_at=now() WHERE agent_id=${agent.id} AND revoked_at IS NULL`;
    if (action !== 'revoke')
      await tx`INSERT INTO agent_tokens(agent_id,token_hash) VALUES(${agent.id},${tokenHash(token)})`;
    await audit(
      tx,
      { type: 'system', id: 'admin-cli' },
      'auth.token_' + action,
      {},
      { agent_id: agent.id },
    );
  });
  if (action !== 'revoke') {
    process.stdout.write(token + '\n');
  } else console.info('Agent tokens revoked.');
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Token operation failed');
  process.exitCode = 1;
} finally {
  await sql.end();
}
