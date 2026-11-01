import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('marketing and login at five widths, demos, metadata and conversion destination', async ({
  page,
  context,
  baseURL,
}) => {
  const directory = path.resolve(
    process.env.VISUAL_OUTPUT_DIR ?? 'output/playwright/launch-local',
    'marketing',
  );
  await mkdir(directory, { recursive: true });
  const errors: string[] = [];
  const mutations: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/'))
      mutations.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results: unknown[] = [];
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveTitle(
      'Vlyntro Agents | One Workspace for Your AI Team',
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://agents.vlyntro.com/',
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow',
    );
    await expect(
      page.locator('meta[property="og:image"]').first(),
    ).toHaveAttribute('content', /\/opengraph-image/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const access = page.getByRole('link', {
      name: 'Request Access',
      exact: false,
    });
    for (const cta of await access.all())
      await expect(cta).toHaveAttribute(
        'href',
        'https://vlyntro.com/contact?build=Agent%20or%20workflow',
      );
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      font: getComputedStyle(document.body).fontFamily,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
    expect(metrics.font).toContain('manrope');
    await page.screenshot({
      path: path.join(directory, `${width}-home.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.screenshot({
      path: path.join(directory, `${width}-hero.png`),
      animations: 'disabled',
    });
    for (const section of ['how-it-works', 'control', 'command-center']) {
      await page.locator('#' + section).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(directory, `${width}-${section}.png`),
        animations: 'disabled',
      });
    }
    const menu = page.getByRole('button', { name: 'Open menu' });
    if (await menu.isVisible()) {
      await menu.click();
      await expect(page.locator('#marketing-menu')).toBeVisible();
      await page.screenshot({
        path: path.join(directory, `${width}-marketing-menu.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(page.locator('#marketing-menu')).not.toBeVisible();
      await expect(menu).toBeFocused();
      await menu.click();
      await page
        .locator('#marketing-menu')
        .getByRole('link', { name: 'Control' })
        .click();
      await expect(page.locator('#marketing-menu')).not.toBeVisible();
      await expect(page).toHaveURL(/#control$/);
    }
    for (const capability of [
      'Agent handoffs',
      'Human approvals',
      'Shared memory',
      'Live operations',
      'Shared conversations',
    ]) {
      await page.getByRole('tab', { name: capability }).click();
      await expect(page.getByRole('tabpanel')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    const conversation = page.locator('#conversation');
    await conversation
      .getByRole('button', { name: 'Review', exact: true })
      .click();
    await conversation.getByRole('button', { name: 'Approve in demo' }).click();
    await expect(
      conversation.getByText('Approved version queued for the next step.'),
    ).toBeVisible();
    await conversation.getByRole('button', { name: 'Replay demo' }).click();
    await expect(
      conversation.getByRole('button', { name: 'Review', exact: true }),
    ).toBeVisible();
    await page
      .locator('#command-center')
      .getByRole('button')
      .filter({ hasText: 'Landing page update' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Example task details' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close task details' }).click();
    await page.goto('/login');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: path.join(directory, `${width}-login.png`),
      fullPage: true,
      animations: 'disabled',
    });
    results.push(metrics);
  }
  expect(mutations).toEqual([]);
  const robots = await context.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /app');
  const sitemap = await context.request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(
    '<loc>https://agents.vlyntro.com/</loc>',
  );
  expect(await sitemap.text()).not.toContain('/app<');
  const social = await context.request.get('/opengraph-image');
  expect(social.status()).toBe(200);
  expect(social.headers()['content-type']).toContain('image/png');
  expect(
    (await context.request.get('/page-that-does-not-exist')).status(),
  ).toBe(404);
  expect(errors).toEqual([]);
  await writeFile(
    path.join(directory, 'marketing-verification.json'),
    JSON.stringify({ baseURL, results, errors, mutations }, null, 2),
  );
});
