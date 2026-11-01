import { sql } from '../packages/db/src/client.js';
try {
  const [row] =
    await sql`SELECT 1 FROM worker_heartbeats WHERE last_seen_at>now()-interval '45 seconds' LIMIT 1`;
  process.exitCode = row ? 0 : 1;
} catch {
  process.exitCode = 1;
} finally {
  await sql.end();
}
