import assert from 'node:assert/strict';
import console from 'node:console';
import { TextDecoder } from 'node:util';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
let tokenId, reader, controller;
try {
  const record = JSON.parse(
    await readFile('/data/artifacts/acceptance-result.json', 'utf8'),
  );
  const token = randomBytes(32).toString('base64url');
  const digest = createHash('sha256').update(token).digest('hex');
  const [row] =
    await sql`INSERT INTO agent_tokens(agent_id,token_hash) SELECT id,${digest} FROM agents WHERE slug='chatgpt' RETURNING id`;
  tokenId = row.id;
  const headers = { authorization: 'Bearer ' + token };
  controller = new globalThis.AbortController();
  const stream = await globalThis.fetch('http://127.0.0.1:4000/api/v1/stream', {
    headers,
    signal: controller.signal,
  });
  assert.equal(stream.status, 200);
  reader = stream.body.getReader();
  await reader.read();
  const body =
    'Transport acceptance: submitted through MCP by the verification script. No model was invoked. ' +
    randomUUID().slice(0, 8);
  const response = await globalThis.fetch('http://127.0.0.1:4000/mcp', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'post_message',
        arguments: {
          channel: record.channel_id,
          body,
          idempotency_key: randomUUID(),
        },
      },
    }),
  });
  assert.equal(response.status, 200);
  const result = (await response.json()).result;
  assert.ok(!result.isError);
  const message = JSON.parse(result.content[0].text);
  let output = '';
  const timeout = globalThis.setTimeout(() => controller.abort(), 10000);
  try {
    while (!output.includes(message.id)) {
      const part = await reader.read();
      if (part.done) break;
      output += new TextDecoder().decode(part.value);
    }
  } finally {
    globalThis.clearTimeout(timeout);
  }
  assert.ok(output.includes('event: message.created'));
  assert.ok(output.includes(message.id));
  const rest = await globalThis.fetch(
    'http://127.0.0.1:4000/api/v1/channels/' + record.channel_id + '/messages',
    { headers },
  );
  assert.equal(rest.status, 200);
  assert.ok(
    (await rest.json()).some(
      (item) => item.id === message.id && item.body === body,
    ),
  );
  record.mcp_message_id = message.id;
  record.mcp_message_body = body;
  await writeFile(
    '/data/artifacts/acceptance-result.json',
    JSON.stringify(record, null, 2),
    { mode: 0o600 },
  );
  console.info(
    JSON.stringify({
      check: 'MCP message persisted and delivered through SSE',
      message_id: message.id,
      body,
    }),
  );
} catch {
  console.error(
    'MCP message verification failed. No tokens or private payloads were logged.',
  );
  process.exitCode = 1;
} finally {
  if (reader) await reader.cancel().catch(() => {});
  controller?.abort();
  if (tokenId)
    await sql`UPDATE agent_tokens SET revoked_at=now() WHERE id=${tokenId}`;
  await sql.end();
}
