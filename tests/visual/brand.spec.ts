import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { waitForApiBudget } from '../rate-budget.js';
test('Vlyntro brand and every workspace view at five widths', async ({
  page,
  context,
  baseURL,
}) => {
  const directory = path.resolve(
    process.env.VISUAL_OUTPUT_DIR ?? 'output/playwright/brand-local',
  );
  await mkdir(directory, { recursive: true });
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const results: unknown[] = [];
  await waitForApiBudget(context.request);
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/login');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(directory, `${width}-login.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  const email = process.env.E2E_EMAIL ?? process.env.ADMIN_EMAIL,
    password = process.env.E2E_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error(
      'Provide browser credentials in the protected environment file.',
    );
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Command Center.' }),
  ).toBeVisible();
  const agents = await (await context.request.get('/api/v1/agents')).json();
  const channels = await (
    await context.request.get('/api/v1/workspaces/vlyntro/channels')
  ).json();
  const views: [string, string, string][] = [
    ['command-center', 'Command Center', 'Command Center.'],
    ...channels.map(
      (c: { slug: string; name: string }) =>
        [c.slug, c.name, c.name] as [string, string, string],
    ),
    ...agents
      .filter((a: { agent_type: string }) => a.agent_type !== 'system')
      .map(
        (a: { slug: string; display_name: string }) =>
          [a.slug, a.display_name, a.display_name + '.'] as [
            string,
            string,
            string,
          ],
      ),
    ...[
      'tasks',
      'approvals',
      'runs',
      'artifacts',
      'blackboard',
      'activity',
      'settings',
    ].map(
      (v) =>
        [
          v,
          v[0].toUpperCase() + v.slice(1),
          v === 'settings'
            ? 'Workspace settings.'
            : v[0].toUpperCase() + v.slice(1) + '.',
        ] as [string, string, string],
    ),
  ];
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, label, heading] of views) {
      await waitForApiBudget(context.request, 45);
      const menu = page.getByRole('button', { name: 'Open navigation' });
      if (await menu.isVisible()) await menu.click();
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(
        page.getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Live connection', { exact: true }),
      ).toBeAttached();
      if (name === 'blackboard') {
        await expect(page.getByLabel('Document JSON')).toBeVisible();
        await expect(page.locator('.blackboard-tabs .active')).toBeInViewport();
      }
      if (['chatgpt', 'muse', 'codex', 'grokbot'].includes(name))
        await expect(
          page.getByRole('heading', {
            name: 'Runtime configuration',
            exact: true,
          }),
        ).toBeVisible();
      if (channels.some((c: { slug: string }) => c.slug === name))
        await expect(
          page.locator('.load-older,.messages .empty'),
        ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyFont: getComputedStyle(document.body).fontFamily,
        headingFont: getComputedStyle(document.querySelector('h1')!).fontFamily,
        background: getComputedStyle(document.documentElement).backgroundColor,
        fontsReady: document.fonts.status,
      }));
      expect(
        metrics.scrollWidth,
        `${name} overflows at ${width}`,
      ).toBeLessThanOrEqual(width);
      expect(metrics.bodyFont).toContain('manrope');
      expect(metrics.headingFont).toContain('parkinsans');
      expect(metrics.background).toBe('rgb(250, 246, 240)');
      await expect(page.locator('body')).not.toContainText('V.');
      await page.screenshot({
        path: path.join(directory, `${width}-${name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      results.push({ name, ...metrics });
    }
    const menu = page.getByRole('button', { name: 'Open navigation' });
    if (await menu.isVisible()) {
      await menu.click();
      await expect(page.locator('.sidebar.open .brand-lockup')).toBeVisible();
      await page.screenshot({
        path: path.join(directory, `${width}-navigation.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
      await expect(menu).toBeFocused();
      await menu.click();
      await page
        .getByRole('button', { name: 'Command Center', exact: true })
        .click();
      await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
    }
    for (const [label, name] of [
      ['Tasks', 'task-detail'],
      ['Runs', 'run-detail'],
    ]) {
      if (await menu.isVisible()) await menu.click();
      await page.getByRole('button', { name: label, exact: true }).click();
      const row = page.locator('main .row-title').first();
      if (await row.count()) {
        await row.click();
        await expect(
          page.getByRole('heading', {
            name: label === 'Tasks' ? 'Task details' : 'Execution summary',
            exact: true,
          }),
        ).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: path.join(directory, `${width}-${name}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
    }
  }
  const icon = await context.request.get('/icon.svg');
  expect(icon.ok()).toBe(true);
  expect(await icon.text()).toContain('M26 44l6 6 6-6');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Private agent operations workspace for Vlyntro.',
  );
  await expect(page).toHaveTitle('Vlyntro Agent HQ');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('.vx-m-eyes')
      .evaluateAll((elements) =>
        elements.every((e) => getComputedStyle(e).animationName === 'none'),
      ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await writeFile(
    path.join(directory, 'verification.json'),
    JSON.stringify(
      { baseURL, checkedAt: new Date().toISOString(), results, errors },
      null,
      2,
    ),
  );
});
