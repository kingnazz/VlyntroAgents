import { sql, type Query } from '../../../packages/db/src/client.js';
export async function claimJob(worker: string, db: Query = sql) {
  const [job] =
    await db`UPDATE jobs SET status='running',claimed_at=now(),claimed_by=${worker},attempts=attempts+1,updated_at=now()
  WHERE id=(SELECT j.id FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE j.status='queued' AND j.available_at<=now() AND j.attempts<j.max_attempts AND a.status<>'disabled'
   AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=j.task_id AND t.status IN ('cancelled','blocked','needs_approval'))
   AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN tasks dependency ON dependency.id=d.depends_on_task_id WHERE d.task_id=j.task_id AND dependency.status<>'completed')
   ORDER BY j.priority DESC,j.available_at,j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1) RETURNING *`;
  return job;
}
export async function recoverJobs() {
  await sql.begin(async (tx) => {
    const stale =
      await tx`SELECT j.id,j.attempts,j.max_attempts FROM jobs j WHERE j.status IN ('running','claimed') AND j.claimed_at<now()-interval '3 minutes' FOR UPDATE SKIP LOCKED`;
    for (const job of stale) {
      const [lock] =
        await tx`SELECT pg_try_advisory_xact_lock(hashtextextended(${job.id},17)) AS acquired`;
      if (!lock.acquired) continue;
      await tx`UPDATE jobs SET status=${job.attempts < job.max_attempts ? 'queued' : 'failed'},available_at=now(),last_error='Worker stopped before completion.',updated_at=now() WHERE id=${job.id}`;
      await tx`UPDATE runs SET status='failed',error='Worker stopped before completion.',completed_at=now() WHERE job_id=${job.id} AND status='running'`;
    }
  });
}
export const retryDelay = (attempt: number) =>
  Math.min(300, 5 * 2 ** Math.max(0, attempt - 1));
