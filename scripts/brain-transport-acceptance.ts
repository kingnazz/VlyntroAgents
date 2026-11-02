import assert from 'node:assert/strict';
import { sql } from '../packages/db/src/client.js';
import { newToken, tokenHash } from '../packages/shared/src/security.js';
const base = process.env.ACCEPTANCE_API_URL ?? 'http://api:4000';
const [workspace] = await sql`SELECT id FROM workspaces WHERE slug='vlyntro'`;
const [agent] = await sql`SELECT id FROM agents WHERE slug='chatgpt'`;
const token = newToken();
let tokenId: string | undefined;
try {
  const [created] =
    await sql`INSERT INTO agent_tokens(agent_id,token_hash) VALUES(${agent.id},${tokenHash(token)}) RETURNING id`;
  tokenId = created.id;
  const headers = {
    authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  const rest = await fetch(
    base +
      '/api/v1/brain/search?workspace_id=' +
      workspace.id +
      '&q=Vlyntro%20Agents%20architecture',
    { headers },
  );
  assert.equal(rest.status, 200);
  const data = await rest.json();
  const response = await fetch(base + '/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'search_brain',
        arguments: {
          workspace_id: workspace.id,
          q: 'Vlyntro Agents architecture',
        },
      },
    }),
  });
  assert.equal(response.status, 200);
  const mcp = await response.json();
  assert(!mcp.result.isError);
  assert.deepEqual(
    JSON.parse(mcp.result.content[0].text).items.map(
      (m: { id: string }) => m.id,
    ),
    data.items.map((m: { id: string }) => m.id),
  );
  const tools = await (
    await fetch(base + '/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    })
  ).json();
  for (const name of [
    'search_brain',
    'read_brain_item',
    'capture_brain_item',
    'list_projects',
    'get_project',
    'list_people',
    'get_person',
    'list_decisions',
  ])
    assert(tools.result.tools.some((t: { name: string }) => t.name === name));
  const denied = await fetch(
    base +
      '/api/v1/brain/search?workspace_id=00000000-0000-4000-8000-000000000001',
    { headers },
  );
  assert.equal(denied.status, 403);
  const preview = await fetch(base + '/api/v1/brain/context-preview', {
    method: 'POST',
    headers,
    body: JSON.stringify({ workspace_id: workspace.id, query: 'architecture' }),
  });
  assert.equal(preview.status, 403);
  assert(
    data.items.some(
      (m: { title: string }) => m.title === 'Vlyntro Agents architecture',
    ),
  );
  console.info(
    'PASS production REST/MCP parity, eight scoped Brain tools, cross-workspace denial and human-only preview',
  );
} finally {
  if (tokenId)
    await sql`UPDATE agent_tokens SET revoked_at=now() WHERE id=${tokenId}`;
  await sql.end();
}
