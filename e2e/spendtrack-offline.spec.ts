import { test, expect } from '@playwright/test';
/**
 * Offline read/write/resume for SpendTrack (#166): an expense created with the
 * network off lands in the Local Store, renders from there, and the Outbox
 * replays it once the connection returns. Exercises the real service worker,
 * the real endpoints and a real authenticated session.
 *
 * Gated behind SPENDTRACK_OFFLINE_E2E=1 because it needs a live Supabase project
 * plus the E2E test user:
 *   Run: SPENDTRACK_OFFLINE_E2E=1 npx playwright test e2e/spendtrack-offline.spec.ts
 */

const ENABLED = process.env.SPENDTRACK_OFFLINE_E2E === '1';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;

test.skip(!ENABLED, 'requires SPENDTRACK_OFFLINE_E2E=1 (live Supabase + auth)');

test('an offline expense reaches the server after reconnect', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });

  const login = await context.request.fetch(`${baseURL}/auth/api/login`, {
    method: 'POST',
    data: {
      email: EMAIL,
      password: PASSWORD,
      redirectTo: null,
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(login.ok()).toBeTruthy();

  const description = `E2E-${Date.now()}`;

  const page = await context.newPage();
  await page.goto(`${baseURL}/spendtrack`, { waitUntil: 'domcontentloaded' });

  const addButton = page.getByRole('button', { name: 'إضافة مصروف' }).first();
  await expect(addButton).toBeVisible();
  // Wait until the Local Store is open before writing, so the write is queued
  // in the Outbox rather than falling back to the (offline) network.
  await expect(page.locator('[data-spendtrack-ready="true"]')).toBeAttached();

  // Reload once online so the service worker takes control and caches the app
  // chunks; an offline lazy-chunk request in dev would otherwise crash the page.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-spendtrack-ready="true"]')).toBeAttached();

  // Warm the lazy chunks the dialog needs while still online.
  await addButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.waitForTimeout(1500);

  // Radio off: the write must land in the Local Store and render from there.
  await context.setOffline(true);
  await expect(async () => {
    await addButton.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  const dialog = page.getByRole('dialog');
  await dialog.locator('#amount').fill('123');
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option').first().click();
  await dialog.locator('#description').fill(description);
  await dialog.getByRole('button', { name: 'إضافة مصروف' }).click();

  await expect(page.getByText(description)).toBeVisible();

  // Radio back on: the `online` trigger flushes the Outbox.
  await context.setOffline(false);

  await expect
    .poll(
      async () => {
        const res = await context.request.fetch(
          `${baseURL}/spendtrack/api/expenses?start=1900-01-01&end=2099-12-31&limit=100&offset=0`
        );
        if (!res.ok()) return [];
        const body = (await res.json()) as { expenses?: Array<{ description: string | null }> };
        return (body.expenses ?? []).map((expense) => expense.description ?? '');
      },
      { timeout: 30_000 }
    )
    .toContain(description);

  // Clean up so the suite is idempotent.
  const res = await context.request.fetch(
    `${baseURL}/spendtrack/api/expenses?start=1900-01-01&end=2099-12-31&limit=100&offset=0`
  );
  const body = (await res.json()) as {
    expenses?: Array<{ id: string; description: string | null }>;
  };
  const created = (body.expenses ?? []).find((expense) => expense.description === description);
  if (created) {
    await context.request.fetch(`${baseURL}/spendtrack/api/expenses/${created.id}`, {
      method: 'DELETE',
      data: {},
    });
  }

  await context.close();
});
