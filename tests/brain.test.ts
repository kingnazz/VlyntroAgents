import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import type { Actor } from '../packages/shared/src/contracts.js';
import type { FastifyInstance } from 'fastify';
let sql: typeof import('../packages/db/src/client.js').sql;
let items: typeof import('../packages/shared/src/brain/items.js');
let captures: typeof import('../packages/shared/src/brain/capture.js');
let entities: typeof import('../packages/shared/src/brain/entities.js');
let retrieval: typeof import('../packages/shared/src/brain/retrieval.js');
let app: FastifyInstance,
  base: string,
  workspace: string,
  other: string,
  channel: string,
  owner: Actor,
  chat: Actor,
  grok: Actor,
  viewer: Actor,
  token: string,
  cookie: string;
const headers = () => ({ origin: 'http://localhost:3000', cookie });
const raw =
  "Met John from Acme today. They're considering replacing their MSP in January. About 45 employees. Uses Microsoft 365. Follow up in December.";
const fixture = {
  people: [
    {
      display_name: 'John',
      organization_name: 'Acme',
      evidence: 'Met John from Acme today.',
    },
  ],
  organizations: [{ name: 'Acme', evidence: 'Acme' }],
  memories: [
    {
      kind: 'fact',
      title: 'Acme uses Microsoft 365',
      body: 'Acme uses Microsoft 365.',
      evidence: 'Uses Microsoft 365.',
      organization_names: ['Acme'],
      person_names: ['John'],
    },
  ],
  follow_ups: [
    {
      title: 'Follow up with John',
      timing_phrase: 'in December',
      evidence: 'Follow up in December.',
    },
  ],
};
const memory = (actor = owner, overrides: Record<string, unknown> = {}) =>
  items.createMemory(actor, {
    workspace_id: workspace,
    title: 'Architecture',
    kind: 'note',
    body: 'Keep application services on the existing VPS.',
    ...overrides,
  });
const capture = (text = raw) =>
  captures.captureBrain(owner, {
    workspace_id: workspace,
    raw_text: text,
    idempotency_key: randomUUID(),
  });
beforeAll(async () => {
  process.env.DATABASE_URL =
    'postgres://hq:local-development-only@127.0.0.1:55432/hq_brain_test';
  const admin = postgres(
    'postgres://hq:local-development-only@127.0.0.1:55432/hq',
  );
  await admin.unsafe('DROP DATABASE IF EXISTS hq_brain_test WITH (FORCE)');
  await admin.unsafe('CREATE DATABASE hq_brain_test');
  await admin.end();
  ({ sql } = await import('../packages/db/src/client.js'));
  await (await import('../packages/db/src/migrate.js')).migrate();
  await (await import('../packages/db/src/seed.js')).seed();
  items = await import('../packages/shared/src/brain/items.js');
  captures = await import('../packages/shared/src/brain/capture.js');
  entities = await import('../packages/shared/src/brain/entities.js');
  retrieval = await import('../packages/shared/src/brain/retrieval.js');
  workspace = (await sql`SELECT id FROM workspaces WHERE slug='vlyntro'`)[0].id;
  other = (
    await sql`INSERT INTO workspaces(slug,name) VALUES('other-brain','Other') RETURNING id`
  )[0].id;
  channel = (await sql`SELECT id FROM channels WHERE slug='general'`)[0].id;
  const user = (
    await sql`INSERT INTO users(email,display_name,password_hash,role) VALUES('brain-owner@example.test','Nazar Test','unused','owner') RETURNING id`
  )[0];
  owner = { type: 'user', id: user.id, role: 'owner' };
  viewer = { ...owner, role: 'viewer' };
  chat = {
    type: 'agent',
    id: (await sql`SELECT id FROM agents WHERE slug='chatgpt'`)[0].id,
    slug: 'chatgpt',
  };
  grok = {
    type: 'agent',
    id: (await sql`SELECT id FROM agents WHERE slug='grokbot'`)[0].id,
    slug: 'grokbot',
  };
  const security = await import('../packages/shared/src/security.js');
  token = security.newToken();
  const session = security.newToken();
  await sql`INSERT INTO agent_tokens(agent_id,token_hash) VALUES(${chat.id},${security.tokenHash(token)})`;
  await sql`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(${owner.id},${security.tokenHash(session)},now()+interval '1 day')`;
  cookie = 'hq_session=' + session;
  app = await (await import('../apps/api/src/app.js')).buildApp();
  base = await app.listen({ host: '127.0.0.1', port: 0 });
});
afterAll(async () => {
  await app?.close();
  await sql?.end();
});
describe('Second Brain trust, versioning and scopes', () => {
  it('partial edits preserve decision kind, importance and provenance metadata', async () => {
    const m = await memory(owner, {
      kind: 'decision',
      importance: 'critical',
      metadata: { source_note: 'Original context' },
    });
    const updated = await items.updateMemory(owner, workspace, m.id, {
      expected_revision: 1,
      summary: 'A shorter description',
    });
    expect(updated.kind).toBe('decision');
    expect(updated.importance).toBe('critical');
    expect(updated.metadata.source_note).toBe('Original context');
  });
  it('partial entity edits preserve project status and source metadata', async () => {
    const p = (await entities.createEntity(owner, 'project', {
      workspace_id: workspace,
      name: 'Paused project',
      status: 'paused',
      metadata: { capture_id: randomUUID() },
    }))!;
    const updated = await entities.updateEntity(
      owner,
      'project',
      workspace,
      p.id,
      { description: 'More context' },
    );
    expect(updated.status).toBe('paused');
    expect(updated.metadata.capture_id).toBe(p.metadata.capture_id);
  });
  it('human creates an active note with an initial immutable snapshot', async () => {
    const m = await memory();
    expect(m.status).toBe('active');
    expect(m.created_by_id).toBe(owner.id);
    expect(await items.revisions(owner, workspace, m.id)).toHaveLength(1);
  });
  it('agent observation preserves attribution', async () => {
    const m = await memory(chat, { kind: 'observation' });
    const read = await items.readMemory(owner, workspace, m.id);
    expect(read.author_name).toBe('ChatGPT');
    expect(read.created_by_type).toBe('agent');
  });
  it.each(['decision', 'preference'])(
    'agent %s cannot silently become authoritative',
    async (kind) => {
      const m = await memory(chat, {
        kind,
        status: 'active',
        metadata: { confirmed_by: owner.id },
      });
      expect(m.status).toBe('proposed');
      expect(m.metadata.confirmed_by).toBeUndefined();
    },
  );
  it('only a human manager can confirm a proposed decision', async () => {
    const m = await memory(chat, { kind: 'decision' });
    await expect(
      items.resolveMemory(chat, workspace, m.id, 'confirm', 1),
    ).rejects.toMatchObject({ status: 403 });
    const confirmed = await items.resolveMemory(
      owner,
      workspace,
      m.id,
      'confirm',
      1,
    );
    expect(confirmed.status).toBe('active');
    expect(confirmed.created_by_id).toBe(chat.id);
    expect(confirmed.metadata.confirmed_by).toBe(owner.id);
    expect(await items.revisions(owner, workspace, m.id)).toHaveLength(2);
  });
  it('every meaningful edit creates a revision and rejects stale concurrent edits', async () => {
    const m = await memory();
    await items.updateMemory(owner, workspace, m.id, {
      expected_revision: 1,
      body: 'Updated conclusion',
      change_reason: 'Corrected source',
    });
    const history = await items.revisions(owner, workspace, m.id);
    expect(history).toHaveLength(2);
    expect(history[1].snapshot.body).toContain('existing VPS');
    await expect(
      items.updateMemory(owner, workspace, m.id, {
        expected_revision: 1,
        title: 'Stale',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('agent write permission cannot rewrite human history', async () => {
    const m = await memory();
    await expect(
      items.updateMemory(chat, workspace, m.id, {
        expected_revision: 1,
        title: 'Rewritten',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('superseding retains old memory and complete replacement history', async () => {
    const m = await memory(owner, { kind: 'decision' });
    const next = await items.supersedeMemory(owner, workspace, m.id, {
      expected_revision: 1,
      kind: 'decision',
      title: 'Updated architecture',
      body: 'Continue using the VPS with an additional backup.',
    });
    expect((await items.readMemory(owner, workspace, m.id)).status).toBe(
      'superseded',
    );
    expect(next.supersedes_id).toBe(m.id);
    expect(
      (await items.revisions(owner, workspace, next.id))[0].snapshot
        .supersedes_id,
    ).toBe(m.id);
  });
  it('archive retains readable history', async () => {
    const m = await memory();
    await items.resolveMemory(owner, workspace, m.id, 'archive', 1);
    expect((await items.readMemory(owner, workspace, m.id)).status).toBe(
      'archived',
    );
  });
  it('workspace filtering prevents cross-workspace ID reads, links and context', async () => {
    const m = await memory(owner, {
      workspace_id: other,
      title: 'Private other workspace',
    });
    await expect(
      items.readMemory(owner, workspace, m.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      retrieval.searchBrain(chat, { workspace_id: other }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      memory(owner, {
        links: [
          {
            target_type: 'project',
            target_id: (await entities.createEntity(owner, 'project', {
              workspace_id: other,
              name: 'Other project',
            }))!.id,
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      (
        await retrieval.buildBrainContext(chat, {
          workspace_id: workspace,
          query: 'Private other workspace',
        })
      ).items.some(
        (m) => m.id === m.id && m.title === 'Private other workspace',
      ),
    ).toBe(false);
  });
  it('brain.read is required independently of workspace.read', async () => {
    const [a] =
      await sql`INSERT INTO agents(slug,display_name,agent_type) VALUES('brain-denied','Denied','llm') RETURNING id`;
    await sql`INSERT INTO agent_permissions(agent_id,workspace_id,permission) VALUES(${a.id},${workspace},'workspace.read')`;
    await expect(
      retrieval.searchBrain(
        { type: 'agent', id: a.id },
        { workspace_id: workspace },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('brain.write is enforced while a propose-only agent can suggest', async () => {
    await expect(memory(grok, { kind: 'observation' })).rejects.toMatchObject({
      status: 403,
    });
    expect((await memory(grok, { kind: 'decision' })).status).toBe('proposed');
    await expect(memory(viewer)).rejects.toMatchObject({ status: 403 });
  });
  it('private source membership remains enforced after unlink and supersede', async () => {
    const [c] =
      await sql`INSERT INTO channels(workspace_id,slug,name,channel_type) VALUES(${workspace},'private-brain','Private','private') RETURNING id`;
    await sql`INSERT INTO channel_members(channel_id,member_type,member_id) VALUES(${c.id},'user',${owner.id})`;
    const [message] =
      await sql`INSERT INTO messages(workspace_id,channel_id,sender_type,sender_id,body) VALUES(${workspace},${c.id},'user',${owner.id},'Private history') RETURNING id`;
    const m = await memory(owner, {
      source_type: 'message',
      source_id: message.id,
    });
    await expect(items.readMemory(chat, workspace, m.id)).rejects.toMatchObject(
      { status: 404 },
    );
    const updated = await items.updateMemory(owner, workspace, m.id, {
      expected_revision: 1,
      links: [],
    });
    const next = await items.supersedeMemory(owner, workspace, m.id, {
      expected_revision: updated.revision_number,
      title: 'Replacement private',
      body: 'Still private',
    });
    await expect(
      items.readMemory(chat, workspace, next.id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('secret-like captures are held and sensitive manual memories never reach agents', async () => {
    const c = await capture('password: example-secret-value-12345');
    expect(c.status).toBe('needs_review');
    let called = false;
    await captures.processCapture(
      c.id,
      async () => {
        called = true;
        return {};
      },
      chat.id,
    );
    expect(called).toBe(false);
    const m = await memory(owner, {
      body: 'api_key: example-secret-value-12345',
    });
    await expect(items.readMemory(chat, workspace, m.id)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      memory(chat, { body: 'password: example-secret-value-12345' }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('revision and raw source records are immutable at the database boundary', async () => {
    const m = await memory();
    await expect(
      sql`UPDATE brain_revisions SET change_reason='tampered' WHERE brain_item_id=${m.id}`,
    ).rejects.toThrow('append-only');
    const c = await capture();
    await expect(
      sql`UPDATE capture_inbox SET raw_text='tampered' WHERE id=${c.id}`,
    ).rejects.toThrow('immutable');
  });
});
describe('durable capture and deterministic extraction', () => {
  it('raw text is committed unchanged before any provider runs and capture is idempotent', async () => {
    const id = randomUUID(),
      text = '  Remember this exactly.\n ';
    const c = await captures.captureBrain(owner, {
      workspace_id: workspace,
      raw_text: text,
      idempotency_key: id,
    });
    expect(c.raw_text).toBe(text);
    expect(
      (await sql`SELECT raw_text FROM capture_inbox WHERE id=${id}`)[0]
        .raw_text,
    ).toBe(text);
    expect(
      (
        await captures.captureBrain(owner, {
          workspace_id: workspace,
          raw_text: text,
          idempotency_key: id,
        })
      ).id,
    ).toBe(c.id);
  });
  it('capture survives an unavailable provider and remains manually convertible', async () => {
    const saved = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
    };
    for (const key of Object.keys(saved)) delete process.env[key];
    try {
      const c = await capture('Provider-independent capture');
      await captures.processCapture(c.id);
      const [pending] = await sql`SELECT * FROM capture_inbox WHERE id=${c.id}`;
      expect(pending.status).toBe('new');
      expect(pending.raw_text).toBe('Provider-independent capture');
      expect(pending.processing_error).toContain('Waiting');
      await captures.reviewCapture(owner, workspace, c.id, 'confirm', {
        kind: 'note',
        title: 'Manual conversion',
        body: pending.raw_text,
      });
      expect(
        (await sql`SELECT status FROM capture_inbox WHERE id=${c.id}`)[0]
          .status,
      ).toBe('processed');
    } finally {
      for (const [key, value] of Object.entries(saved))
        if (value) process.env[key] = value;
    }
  });
  it('deterministic extraction creates entities, sourced facts, relationships and existing tasks', async () => {
    const c = await capture();
    await captures.processCapture(c.id, async () => fixture, chat.id);
    const [done] = await sql`SELECT * FROM capture_inbox WHERE id=${c.id}`;
    expect(done.status).toBe('processed');
    const [john] =
      await sql`SELECT * FROM people WHERE workspace_id=${workspace} AND display_name='John'`;
    expect(john.email).toBeNull();
    expect(john.last_name).toBeNull();
    const [org] =
      await sql`SELECT * FROM organizations WHERE workspace_id=${workspace} AND name='Acme'`;
    expect(org.domain).toBeNull();
    const [task] =
      await sql`SELECT * FROM tasks WHERE id=${done.parsed_result.task_ids[0]}`;
    expect(task.title).toBe('Follow up with John');
    expect(task.due_at).toBeNull();
    expect(task.description).toContain('in December');
    expect(
      await sql`SELECT * FROM entity_links WHERE from_id=${john.id} AND to_id=${org.id} AND relation='WORKS_AT'`,
    ).toHaveLength(1);
    expect(
      await sql`SELECT * FROM brain_items WHERE source_id=${c.id} AND created_by_id=${chat.id}`,
    ).toHaveLength(2);
  });
  it('processing is idempotent across retries and concurrent workers', async () => {
    const c = await capture('Exactly once');
    let calls = 0;
    const extractor = async () => {
      calls++;
      return {
        memories: [
          {
            kind: 'note',
            title: 'Exactly once',
            body: 'Exactly once',
            evidence: 'Exactly once',
          },
        ],
      };
    };
    await Promise.all([
      captures.processCapture(c.id, extractor, chat.id),
      captures.processCapture(c.id, extractor, chat.id),
    ]);
    await captures.processCapture(c.id, extractor, chat.id);
    expect(calls).toBe(1);
    expect(
      await sql`SELECT id FROM brain_items WHERE source_id=${c.id}`,
    ).toHaveLength(1);
  });
  it('same organization is deduplicated within a workspace; ambiguous people are reviewed', async () => {
    const c = await capture();
    await captures.processCapture(c.id, async () => fixture, chat.id);
    expect(
      await sql`SELECT id FROM organizations WHERE workspace_id=${workspace} AND name='Acme'`,
    ).toHaveLength(1);
    expect(
      await sql`SELECT id FROM people WHERE workspace_id=${workspace} AND display_name='John'`,
    ).toHaveLength(1);
    const [done] = await sql`SELECT * FROM capture_inbox WHERE id=${c.id}`;
    expect(done.status).toBe('needs_review');
    expect(done.parsed_result.suggestions[0].reason).toContain('Ambiguous');
  });
  it('normalization recognizes punctuation, case and whitespace without changing raw evidence', () => {
    expect(entities.normalizeEntity(' David’s  Flooring! ')).toBe(
      entities.normalizeEntity("david's flooring"),
    );
  });
  it('human resolves an ambiguous person without silent merge and memory links are versioned', async () => {
    const c = await capture();
    await captures.processCapture(c.id, async () => fixture, chat.id);
    const [john] =
      await sql`SELECT id FROM people WHERE workspace_id=${workspace} AND display_name='John'`;
    const [before] =
      await sql`SELECT parsed_result FROM capture_inbox WHERE id=${c.id}`;
    const result = await captures.resolveCaptureEntity(owner, workspace, c.id, {
      suggestion_index: 0,
      target_id: john.id,
    });
    expect(result.status).toBe('processed');
    const memoryId = before.parsed_result.memory_ids[0];
    expect(
      await sql`SELECT id FROM brain_links WHERE brain_item_id=${memoryId} AND target_type='person' AND target_id=${john.id}`,
    ).toHaveLength(1);
    expect(await items.revisions(owner, workspace, memoryId)).toHaveLength(2);
    await expect(
      captures.resolveCaptureEntity(chat, workspace, c.id, {
        suggestion_index: 0,
        target_id: john.id,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('deduplication does not merge across workspaces', async () => {
    const created = await sql.begin((tx) =>
      entities.createEntityInTx(
        tx,
        owner,
        'organization',
        { workspace_id: other, name: 'Acme' },
        true,
      ),
    );
    expect(created.entity!.workspace_id).toBe(other);
  });
  it('absent surname, email and fabricated dates fail validation', () => {
    expect(() =>
      captures.validateExtraction(
        {
          ...fixture,
          people: [
            {
              display_name: 'John Smith',
              email: 'john@acme.test',
              evidence: 'John',
            },
          ],
        },
        raw,
      ),
    ).toThrow();
    expect(() =>
      captures.validateExtraction(
        {
          ...fixture,
          follow_ups: [
            {
              title: 'Follow up',
              timing_phrase: 'in December',
              due_at: '2026-12-01T00:00:00Z',
              evidence: 'Follow up in December.',
            },
          ],
        },
        raw,
      ),
    ).toThrow();
  });
  it('malformed extraction preserves raw source, rolls back records and can retry', async () => {
    const c = await capture('Retry fixture');
    await captures.processCapture(
      c.id,
      async () => ({
        people: [{ display_name: 'Invented', evidence: 'not present' }],
      }),
      chat.id,
    );
    expect(
      (
        await sql`SELECT status,raw_text FROM capture_inbox WHERE id=${c.id}`
      )[0],
    ).toMatchObject({ status: 'failed', raw_text: 'Retry fixture' });
    expect(
      await sql`SELECT id FROM brain_items WHERE source_id=${c.id}`,
    ).toHaveLength(0);
    await captures.reviewCapture(owner, workspace, c.id, 'retry');
    await captures.processCapture(
      c.id,
      async () => ({
        memories: [
          {
            kind: 'note',
            title: 'Retry fixture',
            body: 'Retry fixture',
            evidence: 'Retry fixture',
          },
        ],
      }),
      chat.id,
    );
    expect(
      (await sql`SELECT status FROM capture_inbox WHERE id=${c.id}`)[0].status,
    ).toBe('processed');
  });
});
describe('retrieval and existing platform integration', () => {
  it('Brain and entity responses explicitly prohibit caching private data', async () => {
    for (const path of [
      '/brain/search',
      '/projects',
      '/people',
      '/organizations',
    ]) {
      const r = await app.inject({
        url: '/api/v1' + path + '?workspace_id=' + workspace,
        headers: headers(),
      });
      expect(r.statusCode).toBe(200);
      expect(r.headers['cache-control']).toBe('private, no-store');
    }
  });
  it('entity mentions retrieve facts even when their body does not repeat the project name', async () => {
    const project = (await entities.createEntity(owner, 'project', {
      workspace_id: workspace,
      name: "David's Flooring",
    }))!;
    const m = await memory(owner, {
      kind: 'fact',
      title: 'Integration requirements',
      body: '10 users. QuickBooks invoice visibility.',
      links: [{ target_type: 'project', target_id: project.id }],
    });
    const c = await retrieval.buildBrainContext(chat, {
      workspace_id: workspace,
      query: "Give me an update on David's Flooring.",
    });
    expect(c.items.some((i) => i.id === m.id)).toBe(true);
  });
  it('PostgreSQL FTS matches relevance, entities and project/person/kind filters', async () => {
    const project = (await entities.createEntity(owner, 'project', {
      workspace_id: workspace,
      name: 'Flooring CRM',
    }))!;
    const person = (await entities.createEntity(owner, 'person', {
      workspace_id: workspace,
      display_name: 'David',
    }))!;
    const m = await memory(owner, {
      kind: 'fact',
      title: 'Invoice visibility',
      body: 'QuickBooks invoices must be visible.',
      links: [
        { target_type: 'project', target_id: project.id },
        { target_type: 'person', target_id: person.id },
      ],
    });
    const result = await retrieval.searchBrain(owner, {
      workspace_id: workspace,
      q: 'invoices',
      kind: 'fact',
      project_id: project.id,
      person_id: person.id,
    });
    expect(result.items.map((i) => i.id)).toContain(m.id);
    expect(
      (
        await retrieval.searchBrain(owner, {
          workspace_id: workspace,
          q: 'Flooring CRM',
        })
      ).items.map((i) => i.id),
    ).toContain(m.id);
    expect(
      (
        await retrieval.searchBrain(owner, {
          workspace_id: workspace,
          q: 'Flooring CRM',
        })
      ).projects.map((p) => p.id),
    ).toContain(project.id);
  });
  it('context is bounded by serialized characters/items and keeps attribution', async () => {
    for (let n = 0; n < 18; n++)
      await memory(owner, {
        title: 'Bounded retrieval ' + n,
        body: 'Bounded retrieval '.repeat(100),
      });
    const context = await retrieval.buildBrainContext(
      chat,
      { workspace_id: workspace, query: 'Bounded retrieval' },
      { items: 10, characters: 4000 },
    );
    expect(context.items.length).toBeLessThanOrEqual(10);
    expect(context.characters).toBe(JSON.stringify(context.items).length);
    expect(context.characters).toBeLessThanOrEqual(4000);
    expect(context.items.length).toBeGreaterThan(0);
    expect(context.items[0]).toHaveProperty('attribution.name', 'Nazar Test');
  });
  it('validity dates exclude expired/future facts from agent context', async () => {
    const m = await memory(owner, {
      title: 'Expired schedule',
      valid_until: '2020-01-01T00:00:00Z',
    });
    const c = await retrieval.buildBrainContext(chat, {
      workspace_id: workspace,
      query: 'Expired schedule',
    });
    expect(c.items.some((i) => i.id === m.id)).toBe(false);
  });
  it('agent jobs receive Brain context and contribute only bounded validated proposals', async () => {
    await sql`UPDATE jobs SET status='cancelled' WHERE status IN ('queued','running')`;
    const { createTask } = await import('../packages/shared/src/work.js');
    const t = await createTask(owner, {
      workspace_id: workspace,
      title: 'Architecture VPS query',
      assigned_agent_id: chat.id,
    });
    const { claimJob } = await import('../apps/worker/src/queue.js');
    const { executeJob } = await import('../apps/worker/src/execute.js');
    const job = await claimJob('brain-test');
    expect(job.task_id).toBe(t.id);
    let received: unknown;
    await executeJob(
      job as Parameters<typeof executeJob>[0],
      async (_agent, context) => {
        received = context;
        return {
          message: 'Architecture reviewed.',
          brain_proposals: [
            {
              kind: 'observation',
              title: 'Architecture reviewed',
              body: 'Reviewed the existing VPS architecture.',
            },
          ],
        };
      },
    );
    expect(
      (received as { brain: { items: unknown[] } }).brain.items.length,
    ).toBeGreaterThan(0);
    expect(
      await sql`SELECT id FROM brain_items WHERE title='Architecture reviewed' AND created_by_id=${chat.id} AND source_type='run'`,
    ).toHaveLength(1);
  });
  it('provider proposals reject extra attribution fields, invalid kinds and more than five items', async () => {
    const { agentOutput } = await import('../packages/shared/src/providers.js');
    const proposal = {
      kind: 'observation',
      title: 'Outcome',
      body: 'Material outcome',
    };
    expect(() =>
      agentOutput.parse({
        message: 'ok',
        brain_proposals: Array(6).fill(proposal),
      }),
    ).toThrow();
    expect(() =>
      agentOutput.parse({
        message: 'ok',
        brain_proposals: [{ ...proposal, created_by_id: owner.id }],
      }),
    ).toThrow();
    expect(() =>
      agentOutput.parse({
        message: 'ok',
        brain_proposals: [{ ...proposal, kind: 'reasoning' }],
      }),
    ).toThrow();
  });
  it.each(['message', 'task', 'run', 'artifact'] as const)(
    'Save-to-Brain validates and links its %s source',
    async (type) => {
      let id: string;
      if (type === 'message')
        id = (
          await sql`INSERT INTO messages(workspace_id,channel_id,sender_type,sender_id,body) VALUES(${workspace},${channel},'user',${owner.id},'Saved source') RETURNING id`
        )[0].id;
      else if (type === 'task')
        id = (
          await sql`INSERT INTO tasks(workspace_id,title,created_by_type,created_by_id) VALUES(${workspace},'Saved source','user',${owner.id}) RETURNING id`
        )[0].id;
      else if (type === 'run')
        id = (
          await sql`INSERT INTO runs(workspace_id,agent_id,status) VALUES(${workspace},${chat.id},'completed') RETURNING id`
        )[0].id;
      else
        id = (
          await sql`INSERT INTO artifacts(workspace_id,created_by_type,created_by_id,artifact_type,name) VALUES(${workspace},'user',${owner.id},'text','Saved source') RETURNING id`
        )[0].id;
      const m = await memory(owner, { source_type: type, source_id: id });
      expect(
        await sql`SELECT id FROM brain_links WHERE brain_item_id=${m.id} AND target_type=${type} AND target_id=${id} AND relation='SOURCE'`,
      ).toHaveLength(1);
    },
  );
  it('MCP and REST search use identical workspace-scoped retrieval', async () => {
    const q = { workspace_id: workspace, q: 'Architecture', limit: 10 };
    const rest = await app.inject({
      url:
        '/api/v1/brain/search?' +
        new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])),
      headers: { authorization: 'Bearer ' + token },
    });
    expect(rest.statusCode).toBe(200);
    const response = await fetch(base + '/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search_brain', arguments: q },
      }),
    });
    const result = await response.json();
    expect(result.result.isError).not.toBe(true);
    expect(
      JSON.parse(result.result.content[0].text).items.map(
        (m: { id: string }) => m.id,
      ),
    ).toEqual(rest.json().items.map((m: { id: string }) => m.id));
  });
  it('REST requires authentication and exposes administrator-only preview and scoped entity APIs', async () => {
    expect(
      (await app.inject('/api/v1/brain/search?workspace_id=' + workspace))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/brain/context-preview',
          headers: { authorization: 'Bearer ' + token },
          payload: { workspace_id: workspace, query: 'Architecture' },
        })
      ).statusCode,
    ).toBe(403);
    const p = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: headers(),
      payload: { workspace_id: workspace, name: 'API project' },
    });
    expect(p.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: '/api/v1/projects/' + p.json().id + '?workspace_id=' + workspace,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(200);
  });
  it('SSE streams ID-only Brain events and mutation audit is append-only', async () => {
    const abort = new AbortController();
    const response = await fetch(
      base + '/api/v1/stream?workspace=' + workspace,
      { headers: { cookie }, signal: abort.signal },
    );
    const reader = response.body!.getReader();
    await reader.read();
    const m = await memory(owner, { title: 'SSE proof' });
    let stream = '';
    try {
      for (let n = 0; n < 5 && !stream.includes(m.id); n++) {
        const read = await reader.read();
        stream += new TextDecoder().decode(read.value);
      }
      expect(stream).toContain('brain.item.created');
      expect(stream).toContain(m.id);
      expect(stream).not.toContain('Keep application services');
    } finally {
      abort.abort();
      await reader.cancel().catch(() => {});
    }
    expect(
      await sql`SELECT id FROM events WHERE action='brain.item.created' AND payload->>'brain_item_id'=${m.id}`,
    ).toHaveLength(1);
  });
  it('stored records survive connection and API restart', async () => {
    const m = await memory(owner, { title: 'Persistence proof' });
    const independent = postgres(process.env.DATABASE_URL!);
    expect(
      (await independent`SELECT title FROM brain_items WHERE id=${m.id}`)[0]
        .title,
    ).toBe('Persistence proof');
    await independent.end();
    await app.close();
    app = await (await import('../apps/api/src/app.js')).buildApp();
    base = await app.listen({ host: '127.0.0.1', port: 0 });
    expect(
      (
        await app.inject({
          url: '/api/v1/brain/items/' + m.id + '?workspace_id=' + workspace,
          headers: headers(),
        })
      ).json().title,
    ).toBe('Persistence proof');
  });
});
