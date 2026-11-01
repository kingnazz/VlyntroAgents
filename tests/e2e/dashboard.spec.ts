import { test, expect } from '@playwright/test';
test.afterEach(async ({ page }) => {
  await page
    .locator('input[type="password"]')
    .evaluateAll((inputs) =>
      inputs.forEach((input) => {
        (input as HTMLInputElement).value = '';
      }),
    )
    .catch(() => {});
});
test('private dashboard, live message, navigation and responsive layout', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  const email = process.env.E2E_EMAIL ?? process.env.ADMIN_EMAIL;
  const password = process.env.E2E_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error(
      'Configure E2E_EMAIL and E2E_PASSWORD securely before browser tests.',
    );
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter workspace' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', { name: 'Command Center.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Agent roster' }),
  ).toBeVisible();
  const menu = async () => {
    const button = page.getByRole('button', { name: 'Open navigation' });
    if (await button.isVisible()) await button.click();
  };
  await menu();
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'General', exact: true }),
  ).toBeVisible();
  const note = `Browser acceptance ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Message General' }).fill(note);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  const rooms = await (
    await context.request.get('/api/v1/workspaces/vlyntro/channels')
  ).json();
  const room = rooms.find((c: { slug: string }) => c.slug === 'general');
  const external = 'SSE browser acceptance ' + Date.now();
  const sent = await context.request.post(
    '/api/v1/channels/' + room.id + '/messages',
    {
      headers: {
        Origin:
          process.env.APP_BASE_URL ??
          process.env.E2E_BASE_URL ??
          'http://localhost:3000',
      },
      data: { body: external, idempotency_key: crypto.randomUUID() },
    },
  );
  expect(sent.ok()).toBe(true);
  await expect(page.getByText(external, { exact: true })).toBeVisible({
    timeout: 12000,
  });
  for (const [button, heading] of [
    ['Tasks', 'Tasks.'],
    ['Approvals', 'Approvals.'],
    ['ChatGPT', 'ChatGPT.'],
    ['Runs', 'Runs.'],
    ['Activity', 'Activity.'],
    ['Artifacts', 'Artifacts.'],
    ['Blackboard', 'Blackboard.'],
    ['Settings', 'Workspace settings.'],
  ]) {
    await menu();
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await menu();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page
    .getByLabel('Title', { exact: true })
    .fill('Safe browser acceptance task ' + Date.now());
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  if (process.env.E2E_APPROVAL_ID) {
    await menu();
    await page.getByRole('button', { name: 'Approvals', exact: true }).click();
    const card = page
      .locator('article.approval-card')
      .filter({
        hasText: 'Production acceptance: record internal confirmation',
      })
      .first();
    await expect(card).toBeVisible();
    const approve = card.getByRole('button', {
      name: 'Approve this action',
      exact: true,
    });
    if (await approve.isVisible()) {
      await card
        .getByLabel('Decision comment')
        .fill('Verified through the production browser acceptance test.');
      await approve.click();
    }
    await expect(card.locator('.badge')).toHaveText('approved');
    const first = await context.request.post(
      '/api/v1/approvals/' + process.env.E2E_APPROVAL_ID + '/approve',
      {
        headers: { Origin: process.env.APP_BASE_URL! },
        data: { comment: 'Idempotent verification' },
      },
    );
    expect(first.status()).toBe(200);
  }
  await menu();
  await page
    .getByRole('button', { name: 'Command Center', exact: true })
    .click();
  await page.screenshot({
    animations: 'disabled',
    path: `test-results/${testInfo.project.name}-command-center.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
