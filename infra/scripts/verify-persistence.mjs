import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
try {
  const record = JSON.parse(
    await readFile('/data/artifacts/acceptance-result.json', 'utf8'),
  );
  const [owner] =
    await sql`SELECT id,password_hash FROM users WHERE email='nazar@vlyntro.com' AND role='owner'`;
  assert.ok(owner && owner.password_hash.startsWith('$argon2id$'));
  assert.equal(
    (await sql`SELECT id FROM messages WHERE id=${record.message_id}`).length,
    1,
  );
  const [job] = await sql`SELECT * FROM jobs WHERE id=${record.job_id}`;
  assert.ok(job && job.task_id);
  assert.equal(
    (await sql`SELECT id FROM tasks WHERE id=${job.task_id}`).length,
    1,
  );
  assert.equal(
    (await sql`SELECT id FROM runs WHERE id=${record.run_id}`).length,
    1,
  );
  const [approval] =
    await sql`SELECT status,reviewed_by_user_id FROM approvals WHERE id=${record.approval_id}`;
  assert.equal(approval.status, 'approved');
  assert.equal(approval.reviewed_by_user_id, owner.id);
  const [document] =
    await sql`SELECT value,version FROM documents WHERE namespace_id='vlyntro-ig' AND key=${record.blackboard_key}`;
  assert.equal(document.version, 2);
  assert.equal(document.value.acceptance, 'updated');
  assert.equal(
    (await sql`SELECT 1 FROM schema_migrations WHERE name='001_initial.sql'`)
      .length,
    1,
  );
  assert.equal(
    (
      await sql`SELECT 1 FROM jobs WHERE payload->>'message_id'=${record.message_id}`
    ).length,
    1,
  );
  assert.equal(
    (
      await sql`SELECT 1 FROM events WHERE action='approval.resolved' AND payload->>'approval_id'=${record.approval_id}`
    ).length,
    1,
  );
  const health = await globalThis.fetch('http://127.0.0.1:4000/api/v1/health');
  assert.equal(health.status, 200);
  console.info(
    'PASS restart persistence: owner, message, task, job, run, approval, Blackboard, migration, audit and worker health.',
  );
} catch {
  console.error(
    'Restart persistence verification failed. No private values were logged.',
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
