import { test, expect } from '@playwright/test';
/**
 * The sync-resume proof for #164: a write made with the network off lands in the
 * Local Store, and when the connection returns the Outbox replays it so the
 * server converges. Exercises the real service worker, the real endpoints and
 * a real authenticated session.
 *
 * Gated behind HABITFLOW_SYNC_E2E=1 because it needs a live Supabase project
 * plus the E2E test user:
 *   Run: HABITFLOW_SYNC_E2E=1 npx playwright test e2e/habitflow-sync-resume.spec.ts
 */

const ENABLED = process.env.HABITFLOW_SYNC_E2E === '1';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;

test.skip(!ENABLED, 'requires HABITFLOW_SYNC_E2E=1 (live Supabase + auth)');

test('an offline habit reaches the server after reconnect', async ({ browser, baseURL }) => {
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

  const name = `E2E-${Date.now()}`;

  const page = await context.newPage();
  await page.goto(`${baseURL}/habitflow`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#btn-create-habit')).toBeVisible();

  // Radio off: the write must land in the Local Store and render from there.
  await context.setOffline(true);
  await page.locator('#btn-create-habit').click();
  await page.locator('#input-add-habit-name').fill(name);
  await page.locator('#btn-submit-add-habit').click();
  await expect(page.getByText(name)).toBeVisible();

  // Radio back on: the `online` trigger flushes the Outbox.
  await context.setOffline(false);

  await expect
    .poll(
      async () => {
        const res = await context.request.fetch(`${baseURL}/habitflow/api/habits`);
        if (!res.ok()) return [];
        const body = (await res.json()) as { habits?: Array<{ name: string }> };
        return (body.habits ?? []).map((habit) => habit.name);
      },
      { timeout: 30_000 }
    )
    .toContain(name);

  // Clean up so the suite is idempotent.
  const res = await context.request.fetch(`${baseURL}/habitflow/api/habits`);
  const body = (await res.json()) as { habits?: Array<{ id: string; name: string }> };
  const created = (body.habits ?? []).find((habit) => habit.name === name);
  if (created) {
    await context.request.fetch(
      `${baseURL}/habitflow/api/habits?id=${encodeURIComponent(created.id)}`,
      { method: 'DELETE' }
    );
  }

  await context.close();
});
