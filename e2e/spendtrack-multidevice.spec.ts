import { test, expect, type BrowserContext, type Page } from '@playwright/test';
/**
 * Two-device reconciliation for SpendTrack (#166): a row created on device A
 * reaches device B, and a delete on A *propagates* to B. This is the regression
 * net for tombstone-aware sync — the bug where a row survived on B forever
 * because the seed/RPCs excluded tombstones and nothing reconciled.
 *
 * Gated behind SPENDTRACK_MULTIDEVICE_E2E=1 because it needs a live Supabase
 * project plus the E2E test user:
 *   Run: SPENDTRACK_MULTIDEVICE_E2E=1 npx playwright test e2e/spendtrack-multidevice.spec.ts
 */

const ENABLED = process.env.SPENDTRACK_MULTIDEVICE_E2E === '1';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;

test.skip(!ENABLED, 'requires SPENDTRACK_MULTIDEVICE_E2E=1 (live Supabase + auth)');

async function signIn(context: BrowserContext, baseURL: string | undefined) {
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
}

async function openSpendtrack(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/spendtrack`, { waitUntil: 'domcontentloaded' });
  // The Local Store is open and reconciling once this marker is attached.
  await expect(page.locator('[data-spendtrack-ready="true"]')).toBeAttached({ timeout: 30_000 });
}

test('a delete made on one device converges on another', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);

  const deviceA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const deviceB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signIn(deviceA, baseURL);
  await signIn(deviceB, baseURL);

  const description = `E2E-MULTI-${Date.now()}`;

  // Device A creates an expense (online; it syncs to the server).
  const pageA = await deviceA.newPage();
  await openSpendtrack(pageA, baseURL);
  await pageA.getByRole('button', { name: 'إضافة مصروف' }).first().click();
  const dialog = pageA.getByRole('dialog');
  await dialog.locator('#amount').fill('77');
  await dialog.getByRole('combobox').first().click();
  await pageA.getByRole('option').first().click();
  await dialog.locator('#description').fill(description);
  await dialog.getByRole('button', { name: 'إضافة مصروف' }).click();

  // Until the server holds it, the create is only local.
  await expect
    .poll(async () => serverExpenses(deviceA, baseURL), { timeout: 30_000 })
    .toContain(description);

  // Device B opens fresh and reconciles from the server: it must see the row.
  const pageB = await deviceB.newPage();
  await openSpendtrack(pageB, baseURL);
  await expect(pageB.getByText(description)).toBeVisible({ timeout: 30_000 });

  // Device A deletes it; the server tombstones the row.
  const created = await findExpense(deviceA, baseURL, description);
  expect(created).not.toBeNull();
  await deviceA.request.fetch(`${baseURL}/spendtrack/api/expenses/${created!.id}`, {
    method: 'DELETE',
    data: { updatedAt: new Date().toISOString() },
  });
  await expect
    .poll(async () => serverExpenses(deviceA, baseURL), { timeout: 30_000 })
    .not.toContain(description);

  // Device B reloads; on open it reconciles the tombstone and drops the row.
  await pageB.reload({ waitUntil: 'domcontentloaded' });
  await pageB.locator('[data-spendtrack-ready="true"]').waitFor({ state: 'attached' });
  await expect(pageB.getByText(description)).toHaveCount(0, { timeout: 30_000 });

  await deviceA.close();
  await deviceB.close();
});

async function serverExpenses(
  context: BrowserContext,
  baseURL: string | undefined
): Promise<string[]> {
  const res = await context.request.fetch(
    `${baseURL}/spendtrack/api/expenses?start=1900-01-01&end=2099-12-31&limit=100&offset=0`
  );
  if (!res.ok()) return [];
  const body = (await res.json()) as { expenses?: Array<{ description: string | null }> };
  return (body.expenses ?? []).map((e) => e.description ?? '');
}

async function findExpense(
  context: BrowserContext,
  baseURL: string | undefined,
  description: string
): Promise<{ id: string } | null> {
  const res = await context.request.fetch(
    `${baseURL}/spendtrack/api/expenses?start=1900-01-01&end=2099-12-31&limit=100&offset=0`
  );
  if (!res.ok()) return null;
  const body = (await res.json()) as {
    expenses?: Array<{ id: string; description: string | null }>;
  };
  return (body.expenses ?? []).find((e) => e.description === description) ?? null;
}
