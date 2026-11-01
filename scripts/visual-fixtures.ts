// Optional local-only visual review data. Never run against a deployment.
import { sql } from '../packages/db/src/client.js';
import { createTask, postMessage } from '../packages/shared/src/work.js';
import { requestApproval } from '../packages/shared/src/approvals.js';
import { createArtifact } from '../packages/shared/src/artifacts.js';
import type { Actor } from '../packages/shared/src/contracts.js';
const url = new URL(process.env.DATABASE_URL ?? '');
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.port !== '55432' ||
  url.pathname !== '/hq' ||
  process.env.NODE_ENV === 'production'
)
  throw new Error(
    'Visual fixtures require the local development database on port 55432.',
  );
try {
  const [user] = await sql`SELECT id FROM users WHERE role='owner' LIMIT 1`;
  const [workspace] = await sql`SELECT id FROM workspaces WHERE slug='vlyntro'`;
  const [channel] = await sql`SELECT id FROM channels WHERE slug='general'`;
  const [muse] = await sql`SELECT id FROM agents WHERE slug='muse'`;
  const actor: Actor = { type: 'user', id: user.id, role: 'owner' };
  const [existing] =
    await sql`SELECT id FROM tasks WHERE title='Review Instagram launch direction' LIMIT 1`;
  if (!existing) {
    const task = await createTask(actor, {
      workspace_id: workspace.id,
      title: 'Review Instagram launch direction',
      description:
        'Local visual review fixture. Compare the opening concept with the current brand bible.',
      priority: 1,
    });
    await requestApproval(actor, {
      workspace_id: workspace.id,
      task_id: task.id,
      requested_by_agent_id: muse.id,
      approval_type: 'action.review',
      title: 'Review Instagram launch direction',
      description:
        'The opening concept is ready for a human decision. Confirm the direction before the next content pass.',
      payload: {
        action: 'Confirm creative direction',
        channel: 'Vlyntro Instagram',
        external_publish: false,
      },
    });
    await createArtifact(actor, {
      workspace_id: workspace.id,
      task_id: task.id,
      artifact_type: 'text',
      name: 'Instagram direction notes',
      content_text:
        'Lead with a useful idea. Keep the language clear, the composition warm, and the human decision visible.\n\nLocal visual review fixture.',
    });
    await postMessage(actor, channel.id, {
      body: 'The launch direction is ready for review. @Muse, keep the tone clear and useful.\n\nLocal visual review fixture.',
      idempotency_key: crypto.randomUUID(),
    });
  }
  console.info('Local visual fixtures ready.');
} finally {
  await sql.end();
}
