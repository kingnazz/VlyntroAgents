import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { sql } from '../packages/db/src/client.js';
import { newToken, tokenHash } from '../packages/shared/src/security.js';
const base = process.env.ACCEPTANCE_API_URL ?? 'http://api:4000';
const origin = process.env.APP_BASE_URL!;
let cookie = '',
  checks = 0;
const tokenIds: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  await run();
  checks++;
  console.info('PASS ' + name);
}
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  token?: string,
) {
  return fetch(base + path, {
    method,
    headers: {
      origin,
      'Content-Type': 'application/json',
      ...(token
        ? { authorization: 'Bearer ' + token }
        : cookie
          ? { cookie }
          : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function tokenFor(slug: string) {
  const token = newToken();
  const [row] =
    await sql`INSERT INTO agent_tokens(agent_id,token_hash) SELECT id,${tokenHash(token)} FROM agents WHERE slug=${slug} RETURNING id,agent_id`;
  tokenIds.push(row.id);
  return { token, agent: row.agent_id };
}
try {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
    throw new Error('Protected owner bootstrap inputs are required.');
  await check('private API rejects unauthenticated access', async () => {
    assert.equal((await request('/api/v1/tasks')).status, 401);
  });
  await check('invalid password is rejected', async () => {
    assert.equal(
      (
        await request('/api/v1/auth/login', 'POST', {
          email: process.env.ADMIN_EMAIL,
          password: 'invalid-acceptance-password',
        })
      ).status,
      401,
    );
  });
  await check('owner login uses secure server session', async () => {
    const response = await request('/api/v1/auth/login', 'POST', {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
    assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie')!;
    assert.match(header, /HttpOnly/);
    assert.match(header, /Secure/);
    cookie = header.split(';')[0];
    assert.equal((await request('/api/v1/auth/me')).status, 200);
  });
  await check('database and worker report healthy', async () => {
    const response = await request('/api/v1/health');
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.database, 'connected');
    assert.equal(health.worker.healthy, true);
  });
  const workspace = (await (await request('/api/v1/workspaces')).json()).find(
    (w: { slug: string }) => w.slug === 'vlyntro',
  );
  const channel = (
    await (await request('/api/v1/workspaces/vlyntro/channels')).json()
  ).find((c: { slug: string }) => c.slug === 'general');
  const key = 'acceptance_' + Date.now();
  await check('Blackboard create read update and conflict', async () => {
    const first = await request('/api/v1/state/vlyntro-ig/' + key, 'POST', {
      value: { acceptance: true },
      expected_version: null,
    });
    assert.equal((await first.json()).version, 1);
    assert.equal(
      (await (await request('/api/v1/state/vlyntro-ig/' + key)).json()).value
        .acceptance,
      true,
    );
    assert.equal(
      (
        await (
          await request('/api/v1/state/vlyntro-ig/' + key, 'POST', {
            value: { acceptance: 'updated' },
            expected_version: 1,
          })
        ).json()
      ).version,
      2,
    );
    const conflict = await request('/api/v1/state/vlyntro-ig/' + key, 'POST', {
      value: 3,
      expected_version: 1,
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.current_version, 2);
  });
  await check(
    'document audit persisted and audit routes are append-only',
    async () => {
      assert.equal(
        (await sql`SELECT * FROM events WHERE key=${key}`).length,
        2,
      );
      assert.equal(
        (await request('/api/v1/events/1', 'PATCH', {})).status,
        404,
      );
      assert.equal(
        (await request('/api/v1/events/1', 'DELETE', {})).status,
        404,
      );
    },
  );
  const chat = await tokenFor('chatgpt'),
    muse = await tokenFor('muse'),
    sales = await tokenFor('grokbot');
  await check('brand lock and namespace token scope', async () => {
    const read = await request(
      '/api/v1/state/vlyntro-ig/brand_bible',
      'GET',
      undefined,
      chat.token,
    );
    assert.equal(read.status, 200);
    const document = await read.json();
    assert.equal(
      (
        await request(
          '/api/v1/state/vlyntro-ig/brand_bible',
          'POST',
          { value: document.value, expected_version: document.version },
          chat.token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          '/api/v1/state/vlyntro-ig/brand_bible',
          'GET',
          undefined,
          sales.token,
        )
      ).status,
      403,
    );
  });
  await check('MCP writes share REST values and versions', async () => {
    const response = await fetch(base + '/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + chat.token,
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
            key: key + '_mcp',
            value: { transport: 'MCP production acceptance' },
            expected_version: null,
          },
        },
      }),
    });
    assert.equal(response.status, 200);
    assert.ok(!(await response.json()).result.isError);
    const read = await (
      await request('/api/v1/state/vlyntro-ig/' + key + '_mcp')
    ).json();
    assert.equal(read.version, 1);
    assert.equal(read.value.transport, 'MCP production acceptance');
  });
  let messageId = '',
    jobId = '',
    runId = '';
  await check('SSE and idempotent production mention routing', async () => {
    const stream = await request('/api/v1/stream');
    assert.equal(stream.status, 200);
    const reader = stream.body!.getReader();
    await reader.read();
    const input = {
      body: '@ChatGPT Reply with a short confirmation that the Vlyntro Agent HQ production routing test succeeded. This is a harmless internal test. Do not publish or contact external systems.',
      idempotency_key: randomUUID(),
    };
    const response = await request(
      '/api/v1/channels/' + channel.id + '/messages',
      'POST',
      input,
    );
    assert.equal(response.status, 200);
    messageId = (await response.json()).id;
    assert.equal(
      (
        await (
          await request(
            '/api/v1/channels/' + channel.id + '/messages',
            'POST',
            input,
          )
        ).json()
      ).id,
      messageId,
    );
    let events = '';
    const timeout = setTimeout(() => {
      void reader.cancel();
    }, 8000);
    try {
      while (!events.includes(messageId)) {
        const part = await reader.read();
        if (part.done) break;
        events += new TextDecoder().decode(part.value);
      }
    } finally {
      clearTimeout(timeout);
      await reader.cancel().catch(() => {});
    }
    assert.match(events, /event: message.created/);
    assert.ok(events.includes(messageId));
    const jobs =
      await sql`SELECT * FROM jobs WHERE payload->>'message_id'=${messageId}`;
    assert.equal(jobs.length, 1);
    jobId = jobs[0].id;
  });
  let providerVerified = false;
  await check('worker claims one job and persists a visible run', async () => {
    for (let i = 0; i < 90; i++) {
      const [job] = await sql`SELECT * FROM jobs WHERE id=${jobId}`;
      if (['completed', 'failed'].includes(job.status)) {
        assert.ok(job.attempts >= 1);
        const [run] =
          await sql`SELECT id,status FROM runs WHERE job_id=${jobId} ORDER BY started_at DESC LIMIT 1`;
        assert.ok(run);
        runId = run.id;
        providerVerified = job.status === 'completed';
        if (!providerVerified)
          assert.match(job.last_error, /missing|configured|Provider/i);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Worker completion deadline exceeded');
  });
  let approvalId = '';
  await check(
    'Muse can request harmless human approval and agents cannot resolve it',
    async () => {
      const response = await request(
        '/api/v1/approvals',
        'POST',
        {
          workspace_id: workspace.id,
          approval_type: 'action.review',
          title: 'Production acceptance: record internal confirmation',
          description:
            'Harmless verification only. Approving records an internal decision and performs no external action.',
          payload: {
            action: 'record internal confirmation only',
            acceptance: true,
          },
        },
        muse.token,
      );
      assert.equal(response.status, 200);
      approvalId = (await response.json()).id;
      assert.equal(
        (
          await request(
            '/api/v1/approvals/' + approvalId + '/approve',
            'POST',
            { comment: 'Forbidden agent decision' },
            muse.token,
          )
        ).status,
        403,
      );
    },
  );
  await check('tokens are hashed and revocation takes effect', async () => {
    const [row] =
      await sql`SELECT token_hash FROM agent_tokens WHERE id=${tokenIds[2]}`;
    assert.notEqual(row.token_hash, sales.token);
    assert.equal(row.token_hash.length, 64);
    await sql`UPDATE agent_tokens SET revoked_at=now() WHERE id=${tokenIds[2]}`;
    assert.equal(
      (await request('/api/v1/agents', 'GET', undefined, sales.token)).status,
      401,
    );
  });
  await check('session logout invalidates reuse', async () => {
    assert.equal(
      (await request('/api/v1/auth/logout', 'POST', {})).status,
      200,
    );
    assert.equal((await request('/api/v1/auth/me')).status, 401);
  });
  const summary = {
    checks_passed: checks,
    workspace_id: workspace.id,
    channel_id: channel.id,
    message_id: messageId,
    job_id: jobId,
    run_id: runId,
    approval_id: approvalId,
    blackboard_key: key,
    provider_execution: providerVerified
      ? 'verified'
      : 'unverified: provider credentials missing or failed',
    verified_at: new Date().toISOString(),
  };
  await writeFile(
    process.env.ACCEPTANCE_OUTPUT ?? '/tmp/vlyntro-acceptance.json',
    JSON.stringify(summary, null, 2),
    { mode: 0o600 },
  );
  console.info(JSON.stringify(summary));
} catch {
  console.error(
    'Production acceptance failed. No credentials or response bodies were logged.',
  );
  process.exitCode = 1;
} finally {
  if (tokenIds.length)
    await sql`UPDATE agent_tokens SET revoked_at=now() WHERE id IN ${sql(tokenIds)} AND revoked_at IS NULL`;
  await sql.end();
}
