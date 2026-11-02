import { test, expect, type Page } from '@playwright/test';
import { waitForApiBudget } from '../rate-budget.js';
test.beforeEach(async ({ page, context }) => {
  test.setTimeout(180000);
  await waitForApiBudget(context.request, 240);
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
});
test.afterEach(async ({ page }) => {
  await page
    .locator('input[type=password]')
    .evaluateAll((inputs) =>
      inputs.forEach((i) => ((i as HTMLInputElement).value = '')),
    )
    .catch(() => {});
});
async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: label, exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test('manual entities, decision provenance, search, detail, revisions and related project/person', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const suffix = testInfo.project.name + ' ' + Date.now(),
    project = 'Brain acceptance project ' + suffix,
    person = 'Brain acceptance person ' + suffix;
  await noOverflow(page);
  await navigate(page, 'Projects');
  await expect(
    page.getByRole('heading', { name: 'Projects.', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('name', { exact: true })
    .fill(project);
  await page
    .getByRole('dialog')
    .getByLabel('description', { exact: true })
    .fill('Harmless local browser acceptance project.');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: project, exact: true }) })
    .click();
  await expect(
    page.getByRole('heading', { name: project + '.', exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await navigate(page, 'People');
  await page.getByRole('button', { name: 'New person', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Name', { exact: true })
    .fill(person);
  await page
    .getByRole('dialog')
    .getByLabel('organization name')
    .fill('Browser fixture company');
  await page.getByRole('button', { name: 'Save person', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: person, exact: true }) })
    .click();
  await expect(
    page.getByRole('heading', { name: person + '.', exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await navigate(page, 'Decisions');
  await page.getByRole('button', { name: 'New memory', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Kind', { exact: true }).selectOption('decision');
  const title = 'Browser architecture decision ' + suffix;
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  await dialog
    .getByLabel('Content', { exact: true })
    .fill('Use the existing VPS for this harmless browser fixture.');
  await dialog.getByLabel(project, { exact: true }).check();
  await dialog.getByLabel(person, { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save memory' }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Provenance', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Source: manual', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit memory', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Content', { exact: true })
    .fill('Use the existing VPS. Browser fixture corrected.');
  await page
    .getByRole('dialog')
    .getByLabel('Change reason')
    .fill('Browser acceptance edit');
  await page.getByRole('button', { name: 'Save memory' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByText(/Version 2 · Browser acceptance edit/),
  ).toBeVisible();
  await noOverflow(page);
  await waitForApiBudget(context.request, 120);
  await navigate(page, 'Memory');
  await page.getByLabel('Search memory').fill(title);
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Project', { exact: true })
    .selectOption({ label: project });
  await page
    .getByLabel('Person', { exact: true })
    .selectOption({ label: person });
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: 'output/playwright/brain-' + testInfo.project.name + '.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
});
test('universal capture, provider-independent Inbox conversion and Save to Brain', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const suffix = testInfo.project.name + ' ' + Date.now(),
    text = 'Harmless browser capture ' + suffix;
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('What would you like to remember?').fill(text);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Capture', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Captured', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await navigate(page, 'Brain Inbox');
  await expect(
    page.getByRole('heading', { name: 'Brain Inbox.', exact: true }),
  ).toBeVisible();
  const card = page.locator('.brain-inbox-item').filter({ hasText: text });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Edit / convert manually' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Title', { exact: true })
    .fill('Converted ' + suffix);
  await expect(
    page.getByRole('dialog').getByLabel('Content', { exact: true }),
  ).toHaveValue(text);
  await page.getByRole('button', { name: 'Save memory' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await noOverflow(page);
  await navigate(page, 'General');
  const message = 'Save to Brain browser source ' + suffix;
  await page.getByRole('textbox', { name: 'Message General' }).fill(message);
  await page.getByRole('button', { name: 'Send message' }).click();
  const row = page.locator('article.message').filter({ hasText: message });
  await row.getByRole('button', { name: 'Save to Brain', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Title', { exact: true })
    .fill('Saved source ' + suffix);
  await page.getByRole('button', { name: 'Save memory' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await waitForApiBudget(context.request, 100);
  await navigate(page, 'Memory');
  await page.getByLabel('Search memory').fill('Saved source ' + suffix);
  await page
    .getByRole('button')
    .filter({
      has: page.getByRole('heading', {
        name: 'Saved source ' + suffix,
        exact: true,
      }),
    })
    .click();
  await expect(page.getByText(/Source: message #/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Revision history', exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  expect(errors).toEqual([]);
});
