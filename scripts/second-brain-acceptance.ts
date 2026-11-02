import { config } from 'dotenv';
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
config({
  path: process.env.OWNER_ENV_FILE ?? '.env',
  quiet: true,
  override: true,
});
const base = process.env.ACCEPTANCE_BASE_URL ?? 'http://localhost:3000';
const origin = new URL(base).origin;
const resultPath =
  process.env.BRAIN_ACCEPTANCE_OUTPUT ??
  'output/playwright/second-brain-production.json';
const phase = process.argv[2] ?? 'prepare';
if (!['prepare', 'verify'].includes(phase))
  throw new Error('Use prepare before restart, then verify afterward.');
const browser = await chromium.launch();
let checks = 0;
const errors: string[] = [];
async function check(label: string, run: () => Promise<void>) {
  await run();
  checks++;
  console.info('PASS ' + label);
}
try {
  await check('owner can sign in through the live browser form', async () => {
    const loginContext = await browser.newContext({ baseURL: base });
    const page = await loginContext.newPage();
    try {
      await page.goto('/login');
      await page
        .getByLabel('Email address')
        .fill(process.env.E2E_EMAIL ?? process.env.ADMIN_EMAIL!);
      await page
        .getByLabel('Password', { exact: true })
        .fill(process.env.E2E_PASSWORD ?? process.env.ADMIN_PASSWORD!);
      await page.getByRole('button', { name: 'Enter workspace' }).click();
      await expect(
        page.getByRole('heading', { name: 'Today.', exact: true }),
      ).toBeVisible();
      await loginContext.request.post('/api/v1/auth/logout', {
        headers: { Origin: origin },
        data: {},
      });
    } finally {
      await page
        .locator('input[type=password]')
        .evaluateAll((inputs) =>
          inputs.forEach((i) => ((i as HTMLInputElement).value = '')),
        )
        .catch(() => {});
      await loginContext.close();
    }
  });
  const context = await browser.newContext({ baseURL: base });
  const response = await context.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: {
      email: process.env.E2E_EMAIL ?? process.env.ADMIN_EMAIL,
      password: process.env.E2E_PASSWORD ?? process.env.ADMIN_PASSWORD,
    },
  });
  assert.equal(response.status(), 200, 'Owner sign-in must succeed');
  const user = await response.json();
  assert.equal(user.role, 'owner');
  const workspaces = await (
    await context.request.get('/api/v1/workspaces')
  ).json();
  const workspace = workspaces.find(
    (w: { slug: string }) => w.slug === 'vlyntro',
  ).id;
  const query = '?workspace_id=' + workspace;
  const title = 'Vlyntro Agents architecture';
  const body =
    'Keep Vlyntro Agents application services and PostgreSQL on the existing VPS rather than introducing Vercel into the core Agent HQ architecture.';
  let record: { id: string; revision_number: number };
  if (phase === 'prepare') {
    const found = await (
      await context.request.get(
        '/api/v1/brain/search' +
          query +
          '&q=' +
          encodeURIComponent(title) +
          '&kind=decision',
      )
    ).json();
    record = found.items.find(
      (m: { title: string; created_by_id: string }) =>
        m.title === title && m.created_by_id === user.id,
    );
    if (!record) {
      const created = await context.request.post('/api/v1/brain/items', {
        headers: { Origin: origin },
        data: {
          workspace_id: workspace,
          kind: 'decision',
          title,
          body,
          importance: 'high',
        },
      });
      assert.equal(created.status(), 200);
      record = await created.json();
    }
    await check(
      'owner architecture decision persists with provenance',
      async () => {
        const r = await context.request.get(
          '/api/v1/brain/items/' + record.id + query,
        );
        assert.equal(r.status(), 200);
        const m = await r.json();
        assert.equal(m.created_by_type, 'user');
        assert.equal(m.created_by_id, user.id);
        assert.equal(m.body, body);
        assert.equal(m.status, 'active');
      },
    );
    const revs = await (
      await context.request.get(
        '/api/v1/brain/items/' + record.id + '/revisions' + query,
      )
    ).json();
    if (revs.length === 1) {
      const abort = new AbortController();
      const cookies = (await context.cookies(origin))
        .map((c) => c.name + '=' + c.value)
        .join('; ');
      const stream = await fetch(
        base + '/api/v1/stream?workspace=' + workspace,
        { headers: { cookie: cookies }, signal: abort.signal },
      );
      assert.equal(stream.status, 200);
      const reader = stream.body!.getReader();
      await reader.read();
      try {
        const edit = await context.request.patch(
          '/api/v1/brain/items/' + record.id + query,
          {
            headers: { Origin: origin },
            data: {
              expected_revision: record.revision_number,
              summary:
                'Agent HQ services and PostgreSQL remain on the existing VPS.',
              change_reason:
                'Verify version history for the authorized architecture decision.',
            },
          },
        );
        assert.equal(edit.status(), 200);
        record = await edit.json();
        await check(
          'SSE delivers the safe memory revision without document content',
          async () => {
            let events = '';
            const timeout = setTimeout(() => abort.abort(), 10000);
            try {
              while (!events.includes(record.id)) {
                const { value, done } = await reader.read();
                if (done) break;
                events += new TextDecoder().decode(value);
              }
              assert(events.includes('brain.item.updated'));
              assert(events.includes(record.id));
              assert(!events.includes(body));
            } finally {
              clearTimeout(timeout);
            }
          },
        );
      } finally {
        abort.abort();
        await reader.cancel().catch(() => {});
      }
    }
    await mkdir('output/playwright', { recursive: true });
    await writeFile(
      resultPath,
      JSON.stringify(
        {
          id: record.id,
          workspace_id: workspace,
          title,
          prepared_at: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  } else {
    const evidence = JSON.parse(await readFile(resultPath, 'utf8'));
    assert.equal(evidence.workspace_id, workspace);
    record = { id: evidence.id, revision_number: 2 };
  }
  await check(
    'memory search, decision filter and history survive service lifecycle',
    async () => {
      const search = await (
        await context.request.get(
          '/api/v1/brain/search' +
            query +
            '&q=Vlyntro%20Agents%20architecture&kind=decision',
        )
      ).json();
      assert(search.items.some((m: { id: string }) => m.id === record.id));
      const revisions = await (
        await context.request.get(
          '/api/v1/brain/items/' + record.id + '/revisions' + query,
        )
      ).json();
      assert(revisions.length >= 2);
      assert.equal(revisions[revisions.length - 1].snapshot.body, body);
    },
  );
  await check(
    'context preview retrieves the exact authorized decision',
    async () => {
      const r = await context.request.post('/api/v1/brain/context-preview', {
        headers: { Origin: origin },
        data: {
          workspace_id: workspace,
          query:
            'What architecture did we choose for Vlyntro Agents PostgreSQL and VPS?',
        },
      });
      assert.equal(r.status(), 200);
      const c = await r.json();
      assert(c.items.some((m: { id: string }) => m.id === record.id));
      assert(c.characters <= 15000);
    },
  );
  await check(
    'Brain mutation is present in the existing append-only audit',
    async () => {
      const events = await (
        await context.request.get('/api/v1/events?workspace=vlyntro&limit=200')
      ).json();
      assert(
        events.some(
          (e: { action: string; payload: { brain_item_id: string } }) =>
            e.action === 'brain.item.created' &&
            e.payload.brain_item_id === record.id,
        ),
      );
      assert.equal(
        (
          await context.request.patch('/api/v1/events/1', {
            headers: { Origin: origin },
            data: {},
          })
        ).status(),
        404,
      );
    },
  );
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/app');
    await expect(
      page.getByRole('heading', { name: 'Today.', exact: true }),
    ).toBeVisible();
    const navigate = async (label: string) => {
      const menu = page.getByRole('button', { name: 'Open navigation' });
      if (await menu.isVisible()) await menu.click();
      await page.getByRole('button', { name: label, exact: true }).click();
    };
    await check(
      'Brain and existing UI, no overflow at ' + viewport.width,
      async () => {
        for (const [label, heading] of [
          ['Memory', 'Memory.'],
          ['Projects', 'Projects.'],
          ['People', 'People.'],
          ['Decisions', 'Decisions.'],
          ['Brain Inbox', 'Brain Inbox.'],
          ['General', 'General'],
          ['Tasks', 'Tasks.'],
          ['Approvals', 'Approvals.'],
          ['Runs', 'Runs.'],
          ['Artifacts', 'Artifacts.'],
          ['Blackboard', 'Blackboard.'],
          ['Activity', 'Activity.'],
        ]) {
          await navigate(label);
          await expect(
            page.getByRole('heading', { name: heading, exact: true }),
          ).toBeVisible();
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
        }
        await navigate('Memory');
        await page.getByLabel('Search memory').fill(title);
        await expect(
          page.getByRole('heading', { name: title, exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button')
          .filter({
            has: page.getByRole('heading', { name: title, exact: true }),
          })
          .click();
        await expect(
          page.getByRole('heading', { name: 'Provenance', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Revision history', exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Capture', exact: true })
          .click();
        await expect(
          page.getByLabel('What would you like to remember?'),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Close dialog', exact: true })
          .click();
      },
    );
    await page.screenshot({
      path:
        'output/playwright/production-brain-' +
        phase +
        '-' +
        viewport.width +
        '.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.close();
  }
  await check(
    'HTTPS/app health and no major browser console errors',
    async () => {
      assert.equal((await context.request.get('/api/v1/health')).status(), 200);
      assert.deepEqual(errors, []);
    },
  );
  const prior = JSON.parse(await readFile(resultPath, 'utf8'));
  await writeFile(
    resultPath,
    JSON.stringify(
      {
        ...prior,
        [phase]: {
          checks,
          verified_at: new Date().toISOString(),
          console_errors: errors,
        },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await context.request.post('/api/v1/auth/logout', {
    headers: { Origin: origin },
    data: {},
  });
  console.info(JSON.stringify({ phase, checks, memory_id: record.id }));
} finally {
  await browser.close();
}
