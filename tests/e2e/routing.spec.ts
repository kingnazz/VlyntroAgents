import { test, expect } from '@playwright/test';
import { waitForApiBudget } from '../rate-budget.js';
test.beforeEach(async ({ context }) => {
  test.setTimeout(120000);
  await waitForApiBudget(context.request, 120);
});

test('public homepage, protected app, session redirects and logout', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const anonymousHome = await context.request.get('/');
  expect(anonymousHome.status()).toBe(200);
  expect(await anonymousHome.text()).toContain('Your AI team,');
  expect(anonymousHome.headers()['x-robots-tag']).toBeUndefined();
  const privateApp = await context.request.get('/app', { maxRedirects: 0 });
  expect(privateApp.status()).toBe(307);
  expect(privateApp.headers().location).toBe('/login');
  expect(privateApp.headers()['x-robots-tag']).toBe('noindex, nofollow');
  const login = await context.request.get('/login', { maxRedirects: 0 });
  expect(login.status()).toBe(200);
  expect(login.headers()['cache-control']).toContain('no-store');
  const invalid = await context.request.get('/app?view=tasks', {
    maxRedirects: 0,
    headers: { Cookie: 'hq_session=' + 'f'.repeat(64) },
  });
  expect(invalid.status()).toBe(307);
  expect((await context.request.get('/api/v1/tasks')).status()).toBe(401);
  expect((await context.request.post('/mcp', { data: {} })).status()).toBe(401);
  await page.goto('/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  await page
    .getByLabel('Email address')
    .fill(process.env.E2E_EMAIL ?? process.env.ADMIN_EMAIL!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.E2E_PASSWORD ?? process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Enter workspace' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole('heading', { name: 'Command Center.' }),
  ).toBeVisible();
  const authenticatedApp = await context.request.get('/app', {
    maxRedirects: 0,
  });
  expect(authenticatedApp.status()).toBe(200);
  expect(authenticatedApp.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  const authenticatedLogin = await context.request.get('/login', {
    maxRedirects: 0,
  });
  expect(authenticatedLogin.status()).toBe(307);
  expect(authenticatedLogin.headers().location).toBe('/app');
  const authenticatedHome = await context.request.get('/', { maxRedirects: 0 });
  expect(authenticatedHome.status()).toBe(200);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Your AI team,',
  );
  await page.goto('/login');
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app?view=settings');
  await expect(
    page.getByRole('heading', { name: 'Workspace settings.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  expect(
    (await context.request.get('/app', { maxRedirects: 0 })).status(),
  ).toBe(307);
  expect(errors).toEqual([]);
});
