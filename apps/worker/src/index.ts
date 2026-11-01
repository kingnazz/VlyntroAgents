import { randomUUID } from 'node:crypto';
import { sql } from '../../../packages/db/src/client.js';
import {
  isConfigured,
  type AgentConfig,
} from '../../../packages/shared/src/providers.js';
import { claimJob, recoverJobs } from './queue.js';
import { executeJob } from './execute.js';
const id = 'worker-' + randomUUID();
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopping = true;
  });
async function heartbeat() {
  await sql`INSERT INTO worker_heartbeats(id) VALUES(${id}) ON CONFLICT(id) DO UPDATE SET last_seen_at=now()`;
  await sql`DELETE FROM worker_heartbeats WHERE last_seen_at<now()-interval '1 day'`;
  const agents =
    await sql`SELECT * FROM agents WHERE status NOT IN ('busy','disabled')`;
  for (const agent of agents) {
    const configured = await isConfigured(agent as unknown as AgentConfig);
    const status = configured
      ? agent.status === 'error'
        ? 'error'
        : 'idle'
      : 'offline';
    await sql`UPDATE agents SET status=${status},configuration=${sql.json({ configured, credential_env: agent.provider ? ({ openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', xai: 'XAI_API_KEY' } as Record<string, string>)[agent.provider] : null })},updated_at=now() WHERE id=${agent.id} AND status NOT IN ('busy','disabled')`;
  }
  await recoverJobs();
}
await heartbeat();
const timer = setInterval(() => {
  void heartbeat().catch(() =>
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'heartbeat.failed',
        worker_id: id,
      }),
    ),
  );
}, 10000);
while (!stopping) {
  try {
    const connection = await sql.reserve();
    try {
      const job = await claimJob(id, connection as unknown as typeof sql);
      if (job) {
        await connection`SELECT pg_advisory_lock(hashtextextended(${job.id},17))`;
        try {
          console.info(
            JSON.stringify({
              level: 'info',
              event: 'job.claimed',
              job_id: job.id,
              worker_id: id,
            }),
          );
          await executeJob(job as Parameters<typeof executeJob>[0]);
        } finally {
          await connection`SELECT pg_advisory_unlock(hashtextextended(${job.id},17))`;
        }
      } else await new Promise((resolve) => setTimeout(resolve, 750));
    } finally {
      connection.release();
    }
  } catch {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'worker.iteration_failed',
        worker_id: id,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
clearInterval(timer);
await sql`DELETE FROM worker_heartbeats WHERE id=${id}`;
await sql.end();
