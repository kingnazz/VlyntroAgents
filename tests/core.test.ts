import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { hash, argon2id } from 'argon2';
import type { FastifyInstance } from 'fastify';
import type { Actor } from '../packages/shared/src/contracts.js';
let app: FastifyInstance;
let sql: typeof import('../packages/db/src/client.js').sql;
let owner: Actor,
  viewer: Actor,
  chat: Actor,
  muse: Actor,
  workspace: string,
  channel: string,
  cookie: string,
  chatToken: string,
  museToken: string,
  base: string;
let writeState: typeof import('../packages/shared/src/state.js').writeState;
let postMessage: typeof import('../packages/shared/src/work.js').postMessage;
let createTask: typeof import('../packages/shared/src/work.js').createTask;
let requestApproval: typeof import('../packages/shared/src/approvals.js').requestApproval;
let resolveApproval: typeof import('../packages/shared/src/approvals.js').resolveApproval;
const origin = { origin: 'http://localhost:3000' };
beforeAll(async () => {
  const admin = postgres(
    'postgres://hq:local-development-only@127.0.0.1:55432/hq',
  );
  await admin.unsafe('DROP DATABASE IF EXISTS hq_test WITH (FORCE)');
  await admin.unsafe('CREATE DATABASE hq_test');
  await admin.end();
  ({ sql } = await import('../packages/db/src/client.js'));
  await (await import('../packages/db/src/migrate.js')).migrate();
  await (await import('../packages/db/src/seed.js')).seed();
  const [w] = await sql`SELECT id FROM workspaces WHERE slug='vlyntro'`;
  workspace = w.id;
  const [c] = await sql`SELECT id FROM channels WHERE slug='general'`;
  channel = c.id;
  const password = await hash('test-owner-passphrase-2026', {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
  });
  const [u] =
    await sql`INSERT INTO users(email,display_name,password_hash,role) VALUES('acceptance@example.test','Nazar Test',${password},'owner') RETURNING id`;
  owner = { type: 'user', id: u.id, role: 'owner' };
  const [v] =
    await sql`INSERT INTO users(email,display_name,password_hash,role) VALUES('viewer@example.test','Viewer',${password},'viewer') RETURNING id`;
  viewer = { type: 'user', id: v.id, role: 'viewer' };
  const [ca] = await sql`SELECT id FROM agents WHERE slug='chatgpt'`;
  chat = { type: 'agent', id: ca.id, slug: 'chatgpt' };
  const [ma] = await sql`SELECT id FROM agents WHERE slug='muse'`;
  muse = { type: 'agent', id: ma.id, slug: 'muse' };
  const security = await import('../packages/shared/src/security.js');
  chatToken = security.newToken();
  museToken = security.newToken();
  await sql`INSERT INTO agent_tokens(agent_id,token_hash) VALUES(${chat.id},${security.tokenHash(chatToken)}),(${muse.id},${security.tokenHash(museToken)})`;
  ({ writeState } = await import('../packages/shared/src/state.js'));
  ({ postMessage, createTask } =
    await import('../packages/shared/src/work.js'));
  ({ requestApproval, resolveApproval } =
    await import('../packages/shared/src/approvals.js'));
  app = await (await import('../apps/api/src/app.js')).buildApp();
  base = await app.listen({ host: '127.0.0.1', port: 0 });
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: origin,
    payload: {
      email: 'acceptance@example.test',
      password: 'test-owner-passphrase-2026',
    },
  });
  expect(response.statusCode).toBe(200);
  cookie = response.cookies[0].name + '=' + response.cookies[0].value;
});
afterAll(async () => {
  await app?.close();
  await sql?.end();
});
const auth = () => ({ ...origin, cookie });
const agentAuth = (token: string) => ({ authorization: 'Bearer ' + token });
describe('authentication and HTTP boundaries', () => {
  it('rejects private API and invalid passwords', async () => {
    expect((await app.inject('/api/v1/tasks')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: origin,
          payload: { email: 'acceptance@example.test', password: 'wrong' },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('uses hashed sessions and HttpOnly SameSite cookies', async () => {
    const result = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: auth(),
    });
    expect(result.json().role).toBe('owner');
    const [session] =
      await sql`SELECT token_hash FROM sessions WHERE user_id=${owner.id}`;
    expect(session.token_hash).toHaveLength(64);
    expect(session.token_hash).not.toBe(cookie.split('=')[1]);
  });
  it('rejects cookie mutations without same-origin proof', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/tasks',
          headers: { cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/tasks',
          headers: { ...auth(), origin: 'https://attacker.test' },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('denies viewer writes', async () => {
    await expect(
      createTask(viewer, { workspace_id: workspace, title: 'Forbidden' }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('invalidates logout and rejects session reuse', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: origin,
      payload: {
        email: 'viewer@example.test',
        password: 'test-owner-passphrase-2026',
      },
    });
    const c = login.cookies[0].name + '=' + login.cookies[0].value;
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    expect(login.headers['set-cookie']).toContain('SameSite=Strict');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: { ...origin, cookie: c },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/v1/auth/me', headers: { cookie: c } }))
        .statusCode,
    ).toBe(401);
  });
  it('publishes OpenAPI 3.1 with session and bearer authentication', async () => {
    const spec = (await app.inject('/api/v1/openapi.json')).json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.components.securitySchemes.agentBearer.scheme).toBe('bearer');
    expect(
      spec.paths['/api/v1/state/{namespace}/{key}'].post.requestBody,
    ).toBeTruthy();
    function verifyRefs(value: unknown) {
      if (Array.isArray(value)) {
        value.forEach(verifyRefs);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const object = value as Record<string, unknown>;
      if (typeof object.$ref === 'string' && object.$ref.startsWith('#/')) {
        let target: unknown = spec;
        for (const segment of object.$ref
          .slice(2)
          .split('/')
          .map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~')))
          target = (target as Record<string, unknown>)?.[segment];
        expect(target, object.$ref).toBeDefined();
      }
      Object.values(object).forEach(verifyRefs);
    }
    verifyRefs(spec);
  });
});
describe('Blackboard, audit and policy', () => {
  it('creates, reads and increments version', async () => {
    const first = await writeState(owner, 'vlyntro-ig', 'roundtrip', {
      value: { hello: 'world' },
      expected_version: null,
    });
    expect(first.version).toBe(1);
    const second = await writeState(owner, 'vlyntro-ig', 'roundtrip', {
      value: { hello: 'updated' },
      expected_version: 1,
    });
    expect(second.version).toBe(2);
    expect(
      (
        await app.inject({
          url: '/api/v1/state/vlyntro-ig/roundtrip',
          headers: auth(),
        })
      ).json().value,
    ).toEqual({ hello: 'updated' });
  });
  it('allows exactly one concurrent write at a version and exposes current version', async () => {
    await writeState(owner, 'vlyntro-ig', 'conflict', {
      value: 1,
      expected_version: null,
    });
    const results = await Promise.allSettled([
      writeState(owner, 'vlyntro-ig', 'conflict', {
        value: 2,
        expected_version: 1,
      }),
      writeState(owner, 'vlyntro-ig', 'conflict', {
        value: 3,
        expected_version: 1,
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/state/vlyntro-ig/conflict',
      headers: auth(),
      payload: { value: 4, expected_version: 1 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.current_version).toBe(2);
  });
  it('rolls back document write if audit insert fails', async () => {
    await sql.unsafe(
      "CREATE FUNCTION test_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key='atomic_failure' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$",
    );
    await sql.unsafe(
      'CREATE TRIGGER test_event_failure BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION test_reject_event()',
    );
    try {
      await expect(
        writeState(owner, 'vlyntro-ig', 'atomic_failure', {
          value: 1,
          expected_version: null,
        }),
      ).rejects.toThrow();
      expect(
        await sql`SELECT 1 FROM documents WHERE key='atomic_failure'`,
      ).toHaveLength(0);
    } finally {
      await sql.unsafe('DROP TRIGGER test_event_failure ON events');
      await sql.unsafe('DROP FUNCTION test_reject_event()');
    }
  });
  it('persists audit event in successful write transaction', async () => {
    await writeState(owner, 'vlyntro-ig', 'atomic_success', {
      value: { ok: true },
      expected_version: null,
    });
    const [event] = await sql`SELECT * FROM events WHERE key='atomic_success'`;
    expect(event.action).toBe('document.updated');
    expect(event.payload.version).toBe(1);
  });
  it('rejects update/delete audit routes and database mutations', async () => {
    for (const method of ['PATCH', 'DELETE'] as const)
      expect(
        (
          await app.inject({
            method,
            url: '/api/v1/events/1',
            headers: auth(),
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
    await expect(
      sql`UPDATE events SET action='tampered' WHERE id=(SELECT min(id) FROM events)`,
    ).rejects.toThrow('append-only');
  });
  it('locks brand rules against ChatGPT while allowing Muse and owner', async () => {
    const read = (
      await app.inject({
        url: '/api/v1/state/vlyntro-ig/brand_bible',
        headers: agentAuth(chatToken),
      })
    ).json();
    expect(read.version).toBe(1);
    await expect(
      writeState(chat, 'vlyntro-ig', 'brand_bible', {
        value: read.value,
        expected_version: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await writeState(muse, 'vlyntro-ig', 'brand_bible', {
          value: read.value,
          expected_version: 1,
        })
      ).version,
    ).toBe(2);
    expect(
      (
        await writeState(owner, 'vlyntro-ig', 'brand_bible', {
          value: read.value,
          expected_version: 2,
        })
      ).version,
    ).toBe(3);
  });
  it('keeps performance append-only and ChatGPT read-only', async () => {
    const value = {
      entries: [
        {
          post_id: 'one',
          impressions: 10,
          likes: 2,
          comments: 0,
          saves: 1,
          notes: 'Test metrics',
          recorded_at: new Date().toISOString(),
        },
      ],
    };
    await expect(
      writeState(chat, 'vlyntro-ig', 'performance_log', {
        value,
        expected_version: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await writeState(muse, 'vlyntro-ig', 'performance_log', {
      value,
      expected_version: 1,
    });
    await expect(
      writeState(muse, 'vlyntro-ig', 'performance_log', {
        value: { entries: [] },
        expected_version: 2,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('requires human approval of exact content and rejects agent resolution', async () => {
    const post = {
      id: 'post-acceptance',
      status: 'drafted',
      caption: 'Restrained test caption',
      hooks: ['A real capture'],
      media_refs: [],
      review_notes: '',
      scheduled_for: null,
      published_url: null,
      metrics: {},
    };
    await writeState(chat, 'vlyntro-ig', 'pipeline', {
      value: { posts: [post] },
      expected_version: 1,
    });
    await expect(
      writeState(chat, 'vlyntro-ig', 'pipeline', {
        value: { posts: [{ ...post, status: 'approved' }] },
        expected_version: 2,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await writeState(muse, 'vlyntro-ig', 'pipeline', {
      value: { posts: [{ ...post, status: 'in_review' }] },
      expected_version: 2,
    });
    await expect(
      writeState(muse, 'vlyntro-ig', 'pipeline', {
        value: { posts: [{ ...post, status: 'approved' }] },
        expected_version: 3,
      }),
    ).rejects.toMatchObject({ status: 403 });
    const approval = await requestApproval(muse, {
      workspace_id: workspace,
      approval_type: 'content.publish',
      title: 'Review test content',
      payload: { post_id: post.id },
    });
    await expect(
      resolveApproval(muse, approval.id, 'approved'),
    ).rejects.toMatchObject({ status: 403 });
    expect((await resolveApproval(owner, approval.id, 'approved')).status).toBe(
      'approved',
    );
    expect((await resolveApproval(owner, approval.id, 'approved')).status).toBe(
      'approved',
    );
    await expect(
      resolveApproval(owner, approval.id, 'rejected'),
    ).rejects.toMatchObject({ status: 409 });
    const [document] =
      await sql`SELECT value FROM documents WHERE key='pipeline'`;
    expect(document.value.posts[0].status).toBe('approved');
  });
  it('rejects approving content changed since the request', async () => {
    const [doc] = await sql`SELECT * FROM documents WHERE key='pipeline'`;
    const draft = { ...doc.value.posts[0], id: 'changed', status: 'drafted' };
    await writeState(chat, 'vlyntro-ig', 'pipeline', {
      value: { posts: [...doc.value.posts, draft] },
      expected_version: doc.version,
    });
    const review = { ...draft, status: 'in_review' };
    await writeState(muse, 'vlyntro-ig', 'pipeline', {
      value: { posts: [...doc.value.posts, review] },
      expected_version: doc.version + 1,
    });
    const approval = await requestApproval(muse, {
      workspace_id: workspace,
      approval_type: 'content.publish',
      title: 'Stale review',
      payload: { post_id: 'changed' },
    });
    await writeState(muse, 'vlyntro-ig', 'pipeline', {
      value: {
        posts: [
          ...doc.value.posts,
          { ...review, caption: 'Changed after review' },
        ],
      },
      expected_version: doc.version + 2,
    });
    await expect(
      resolveApproval(owner, approval.id, 'approved'),
    ).rejects.toMatchObject({ status: 409, code: 'content_changed' });
  });
});
describe('agent scoping and messaging', () => {
  it('stores hashes only and rejects revoked and unscoped tokens', async () => {
    const { newToken, tokenHash } =
      await import('../packages/shared/src/security.js');
    const token = newToken();
    const [a] = await sql`SELECT id FROM agents WHERE slug='grokbot'`;
    await sql`INSERT INTO agent_tokens(agent_id,token_hash) VALUES(${a.id},${tokenHash(token)})`;
    expect(
      (
        await app.inject({
          url: '/api/v1/state/vlyntro-ig/brand_bible',
          headers: agentAuth(token),
        })
      ).statusCode,
    ).toBe(403);
    const [stored] =
      await sql`SELECT token_hash FROM agent_tokens WHERE agent_id=${chat.id}`;
    expect(stored.token_hash).not.toBe(chatToken);
    expect(stored.token_hash).toHaveLength(64);
    await sql`UPDATE agent_tokens SET revoked_at=now() WHERE token_hash=${tokenHash(token)}`;
    expect(
      (await app.inject({ url: '/api/v1/agents', headers: agentAuth(token) }))
        .statusCode,
    ).toBe(401);
  });
  it('deduplicates human message retries and mention jobs', async () => {
    const input = {
      body: '@ChatGPT draft three safe concepts.',
      idempotency_key: randomUUID(),
    };
    const a = await postMessage(owner, channel, input),
      b = await postMessage(owner, channel, input);
    expect(a.id).toBe(b.id);
    expect(
      await sql`SELECT 1 FROM jobs WHERE payload->>'message_id'=${a.id}`,
    ).toHaveLength(1);
  });
  it('streams persisted message.created events and closes cleanly', async () => {
    const controller = new AbortController();
    const stream = await fetch(base + '/api/v1/stream', {
      headers: { cookie },
      signal: controller.signal,
    });
    expect(stream.status).toBe(200);
    const reader = stream.body!.getReader();
    await reader.read();
    const message = await postMessage(owner, channel, {
      body: 'SSE acceptance message',
      idempotency_key: randomUUID(),
    });
    let output = '';
    try {
      while (!output.includes(message.id)) {
        const result = await reader.read();
        output += new TextDecoder().decode(result.value);
      }
    } finally {
      controller.abort();
      await reader.cancel().catch(() => {});
    }
    expect(output).toContain('event: message.created');
  });
  it('stops handoffs at depth five and blocks the associated task', async () => {
    const task = await createTask(owner, {
      workspace_id: workspace,
      title: 'Handoff cap',
    });
    await postMessage(
      chat,
      channel,
      { body: '@Muse a capped handoff', idempotency_key: randomUUID() },
      { depth: 5, taskId: task.id },
    );
    const [updated] = await sql`SELECT status FROM tasks WHERE id=${task.id}`;
    expect(updated.status).toBe('blocked');
    expect(await sql`SELECT 1 FROM jobs WHERE task_id=${task.id}`).toHaveLength(
      0,
    );
  });
  it('prevents reading private channels through task detail', async () => {
    const [privateChannel] =
      await sql`INSERT INTO channels(workspace_id,slug,name,channel_type) VALUES(${workspace},'private-test','Private','private') RETURNING id`;
    const [task] =
      await sql`INSERT INTO tasks(workspace_id,channel_id,title,created_by_type,created_by_id) VALUES(${workspace},${privateChannel.id},'Secret task','user',${owner.id}) RETURNING id`;
    expect(
      (await app.inject({ url: '/api/v1/tasks/' + task.id, headers: auth() }))
        .statusCode,
    ).toBe(403);
    const rows = (
      await app.inject({ url: '/api/v1/tasks', headers: auth() })
    ).json();
    expect(rows.some((t: { id: string }) => t.id === task.id)).toBe(false);
  });
  it('enforces task dependency self checks at the database boundary', async () => {
    const task = await createTask(owner, {
      workspace_id: workspace,
      title: 'Dependency test',
    });
    await expect(
      sql`INSERT INTO task_dependencies(task_id,depends_on_task_id) VALUES(${task.id},${task.id})`,
    ).rejects.toThrow();
  });
});
describe('worker execution and recovery', () => {
  it('does not recover a stale job while its execution session lock is held', async () => {
    const [job] =
      await sql`INSERT INTO jobs(workspace_id,agent_id,job_type,status,attempts,claimed_at) VALUES(${workspace},${chat.id},'recovery-test','running',1,now()-interval '20 minutes') RETURNING id`;
    const connection = await sql.reserve();
    const { recoverJobs } = await import('../apps/worker/src/queue.js');
    try {
      await connection`SELECT pg_advisory_lock(hashtextextended(${job.id},17))`;
      await recoverJobs();
      expect(
        (await sql`SELECT status FROM jobs WHERE id=${job.id}`)[0].status,
      ).toBe('running');
      await connection`SELECT pg_advisory_unlock(hashtextextended(${job.id},17))`;
      await recoverJobs();
      expect(
        (await sql`SELECT status FROM jobs WHERE id=${job.id}`)[0].status,
      ).toBe('queued');
    } finally {
      await connection`SELECT pg_advisory_unlock_all()`;
      connection.release();
      await sql`UPDATE jobs SET status='cancelled' WHERE id=${job.id}`;
    }
  });
  it('grants one owner when two workers claim one job', async () => {
    await sql`UPDATE jobs SET status='cancelled' WHERE status='queued'`;
    await sql`INSERT INTO jobs(workspace_id,agent_id,job_type) VALUES(${workspace},${chat.id},'test')`;
    const { claimJob } = await import('../apps/worker/src/queue.js');
    const claims = await Promise.all([claimJob('one'), claimJob('two')]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it('records a real run and same-channel response with a deterministic test adapter', async () => {
    await sql`UPDATE jobs SET status='cancelled' WHERE status IN ('queued','running')`;
    const message = await postMessage(owner, channel, {
      body: '@ChatGPT test the adapter interface',
      idempotency_key: randomUUID(),
    });
    const { claimJob } = await import('../apps/worker/src/queue.js');
    const job = await claimJob('adapter-test');
    expect(job.payload.message_id).toBe(message.id);
    const { executeJob } = await import('../apps/worker/src/execute.js');
    await executeJob(job as Parameters<typeof executeJob>[0], async () => ({
      message: 'Test adapter response',
      state_writes: [],
      approval: null,
    }));
    const [run] = await sql`SELECT * FROM runs WHERE job_id=${job.id}`;
    expect(run.status).toBe('completed');
    expect(
      await sql`SELECT 1 FROM run_steps WHERE run_id=${run.id}`,
    ).not.toHaveLength(0);
    expect(
      await sql`SELECT 1 FROM messages WHERE channel_id=${channel} AND body='Test adapter response'`,
    ).toHaveLength(1);
  });
  it('records provider errors and schedules bounded retry without crashing', async () => {
    const { ExecutionError } =
      await import('../packages/shared/src/providers.js');
    const { claimJob, retryDelay } =
      await import('../apps/worker/src/queue.js');
    const { executeJob } = await import('../apps/worker/src/execute.js');
    await sql`INSERT INTO jobs(workspace_id,agent_id,job_type) VALUES(${workspace},${chat.id},'failure')`;
    const job = await claimJob('failure-test');
    await executeJob(job as Parameters<typeof executeJob>[0], async () => {
      throw new ExecutionError('Provider request failed (HTTP 503).');
    });
    const [updated] = await sql`SELECT * FROM jobs WHERE id=${job.id}`;
    expect(updated.status).toBe('queued');
    expect(updated.attempts).toBe(1);
    expect(updated.last_error).toContain('503');
    expect(retryDelay(10)).toBe(300);
    await sql`UPDATE jobs SET status='cancelled' WHERE id=${job.id}`;
  });
  it('marks absent provider credentials offline and permanent failures terminal', async () => {
    const { isConfigured, ExecutionError } =
      await import('../packages/shared/src/providers.js');
    expect(
      await isConfigured({
        agent_type: 'llm',
        provider: 'unknown',
        model: 'none',
        system_prompt: '',
        slug: 'test',
      }),
    ).toBe(false);
    const { claimJob } = await import('../apps/worker/src/queue.js');
    const { executeJob } = await import('../apps/worker/src/execute.js');
    await sql`INSERT INTO jobs(workspace_id,agent_id,job_type) VALUES(${workspace},${chat.id},'missing-key')`;
    const job = await claimJob('missing-test');
    await executeJob(job as Parameters<typeof executeJob>[0], async () => {
      throw new ExecutionError('Provider key is missing.', true);
    });
    expect(
      (await sql`SELECT status FROM jobs WHERE id=${job.id}`)[0].status,
    ).toBe('failed');
  });
  it('resumes an approval-associated task once', async () => {
    const task = await createTask(owner, {
      workspace_id: workspace,
      title: 'Safe approval resume',
    });
    await sql`UPDATE tasks SET assigned_agent_id=${muse.id} WHERE id=${task.id}`;
    const approval = await requestApproval(muse, {
      workspace_id: workspace,
      task_id: task.id,
      approval_type: 'action.review',
      title: 'Harmless internal test',
      payload: { action: 'record confirmation only' },
    });
    await resolveApproval(owner, approval.id, 'approved', 'Safe to record');
    await resolveApproval(owner, approval.id, 'approved');
    expect(
      await sql`SELECT 1 FROM jobs WHERE idempotency_key=${'approval:' + approval.id}`,
    ).toHaveLength(1);
  });
  it('reports healthy database and worker visibility', async () => {
    await sql`INSERT INTO worker_heartbeats(id) VALUES('acceptance-worker')`;
    const response = await app.inject('/api/v1/health');
    expect(response.statusCode).toBe(200);
    expect(response.json().database).toBe('connected');
    expect(response.json().worker.healthy).toBe(true);
  });
});
describe('MCP Streamable HTTP parity', () => {
  it('hands task ownership from ChatGPT to Muse before requesting human approval', async () => {
    await sql`UPDATE jobs SET status='cancelled' WHERE status IN ('queued','running','waiting')`;
    const message = await postMessage(owner, channel, {
      body: '@ChatGPT prepare a safe review handoff',
      idempotency_key: randomUUID(),
    });
    const { claimJob } = await import('../apps/worker/src/queue.js');
    const { executeJob } = await import('../apps/worker/src/execute.js');
    const first = await claimJob('handoff-chat');
    expect(first.payload.message_id).toBe(message.id);
    await executeJob(first as Parameters<typeof executeJob>[0], async () => ({
      message: 'Draft ready. @Muse please review.',
      state_writes: [],
      approval: null,
    }));
    const second = await claimJob('handoff-muse');
    expect(second.agent_id).toBe(muse.id);
    expect(second.task_id).toBe(first.task_id);
    await executeJob(second as Parameters<typeof executeJob>[0], async () => ({
      message: 'Review complete. Waiting for a human.',
      state_writes: [],
      approval: {
        approval_type: 'action.review',
        title: 'Full handoff approval test',
        description: 'Harmless internal review.',
        payload: { action: 'record confirmation' },
      },
    }));
    const [approval] =
      await sql`SELECT * FROM approvals WHERE task_id=${first.task_id}`;
    expect(approval.status).toBe('pending');
    expect((await resolveApproval(owner, approval.id, 'approved')).status).toBe(
      'approved',
    );
  });
  it('writes state over MCP and reads the same value over REST', async () => {
    const response = await fetch(base + '/mcp', {
      method: 'POST',
      headers: {
        ...agentAuth(chatToken),
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'write_state',
          arguments: {
            namespace: 'vlyntro-ig',
            key: 'mcp_parity',
            value: { transport: 'streamable-http' },
            expected_version: null,
          },
        },
      }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.isError).not.toBe(true);
    const result = (
      await app.inject({
        url: '/api/v1/state/vlyntro-ig/mcp_parity',
        headers: auth(),
      })
    ).json();
    expect(result.value).toEqual({ transport: 'streamable-http' });
    expect(result.version).toBe(1);
  });
  it('posts MCP messages and exposes them through REST', async () => {
    const response = await fetch(base + '/mcp', {
      method: 'POST',
      headers: {
        ...agentAuth(chatToken),
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'post_message',
          arguments: {
            channel,
            body: 'MCP parity message',
            idempotency_key: randomUUID(),
          },
        },
      }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.isError).not.toBe(true);
    expect(
      (
        await app.inject({
          url: '/api/v1/channels/' + channel + '/messages',
          headers: auth(),
        })
      )
        .json()
        .some((m: { body: string }) => m.body === 'MCP parity message'),
    ).toBe(true);
  });
  it('rejects cookie-only MCP and legacy GET transport', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/mcp',
          headers: auth(),
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: '/mcp', headers: agentAuth(chatToken) }))
        .statusCode,
    ).toBe(405);
  });
});
