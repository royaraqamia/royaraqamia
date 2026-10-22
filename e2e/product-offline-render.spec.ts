import { test, expect, type Page } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';
import { signIn } from './sign-in';

/**
 * The offline-render drill for the four product dashboards (#449, ADR-0073).
 *
 * Before Phase 2 every one of these roots was `force-dynamic` and on the
 * worker's never-cache list, so a reload with the radio off landed on
 * `/offline`. The drill is the promise in the issue: visit the root once online,
 * reload it offline, and assert the product's own chrome — and, where the root
 * shows owned rows, the row written while offline — instead of the offline page's
 * retry link.
 *
 * Gated behind PRODUCT_OFFLINE_E2E=1 because it needs a live Supabase project
 * plus the E2E test user:
 *   PRODUCT_OFFLINE_E2E=1 npx playwright test e2e/product-offline-render.spec.ts
 */

const ENABLED = process.env.PRODUCT_OFFLINE_E2E === '1';

test.skip(!ENABLED, 'requires PRODUCT_OFFLINE_E2E=1 (live Supabase + auth)');

const OFFLINE_RETRY = 'إعادة المحاولة';

/** Asserts this is the product's own document, not `/offline`. */
async function expectNotOffline(page: Page) {
  await expect(page.getByRole('link', { name: OFFLINE_RETRY })).toHaveCount(0);
}

/** The shared pill's offline state: the connection is named, not implied. */
async function expectOfflinePill(page: Page) {
  // The global connectivity indicator says the same thing, so take the first
  // `status` that carries the copy rather than demanding a single one.
  await expect(page.getByRole('status').filter({ hasText: 'غير متَّصل' }).first()).toBeVisible();
}

test('HabitFlow reloads offline and keeps the habit written with the radio off', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);

  const name = `E2E-${Date.now()}`;
  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/habitflow`);
  await expect(page.locator('#btn-create-habit')).toBeVisible();

  // Radio off: the write lands in the Local Store and paints from there.
  await context.setOffline(true);
  await page.locator('#btn-create-habit').click();
  await page.locator('#input-add-habit-name').fill(name);
  await page.locator('#btn-submit-add-habit').click();
  await expect(page.getByText(name)).toBeVisible();
  await expectOfflinePill(page);

  // The reload is the drill: the cached document paints the same rows.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'تتبُّع العادات' })).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
  await expectNotOffline(page);

  // Clean up so the suite is idempotent.
  await context.setOffline(false);
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

test('SpendTrack reloads offline and keeps the expense written with the radio off', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);

  const description = `E2E-${Date.now()}`;
  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/spendtrack`);

  const addButton = page.getByRole('button', { name: 'إضافة مصروف' }).first();
  await expect(addButton).toBeVisible();
  await expect(page.locator('[data-spendtrack-ready="true"]')).toBeAttached();

  // Warm the dialog's lazy chunks while still online.
  await addButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  await expect(async () => {
    await addButton.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  const dialog = page.getByRole('dialog');
  await dialog.locator('#amount').fill('42');
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option').first().click();
  await dialog.locator('#description').fill(description);
  await dialog.getByRole('button', { name: 'إضافة مصروف' }).click();
  await expect(page.getByText(description)).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'تتبُّع المصاريف' })).toBeVisible();
  await expect(page.getByText(description)).toBeVisible();
  await expectNotOffline(page);

  // Clean up so the suite is idempotent.
  await context.setOffline(false);
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

test('LinkSnap reloads offline and reports the link it queued', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);

  const code = `e2e${Date.now().toString(36)}`;
  const url = `https://example.com/${code}`;
  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/linksnap`);
  await expect(page.locator('[data-linksnap-ready="true"]')).toBeAttached();
  await expect(page.locator('#original-url')).toBeVisible();

  await context.setOffline(true);
  await page.locator('#original-url').fill(url);
  await page.locator('#custom-code').fill(code);
  await page.locator('#btn-shorten-url').click();
  await expectOfflinePill(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'اختصار الرَّوابط' })).toBeVisible();
  await expect(page.locator('#original-url')).toBeVisible();
  await expectOfflinePill(page);
  await expectNotOffline(page);

  // Clean up so the suite is idempotent (the queued create flushes on reconnect).
  await context.setOffline(false);
  await expect
    .poll(
      async () => {
        const res = await context.request.fetch(`${baseURL}/linksnap/api/links`);
        if (!res.ok()) return false;
        const body = (await res.json()) as { links?: Array<{ code: string }> };
        return (body.links ?? []).some((link) => link.code === code);
      },
      { timeout: 30_000 }
    )
    .toBe(true);
  await context.request.fetch(`${baseURL}/linksnap/api/links?code=${encodeURIComponent(code)}`, {
    method: 'DELETE',
    data: {},
  });

  await context.close();
});

test('BlogPress reloads offline and paints its posts and stats', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);

  const stamp = Date.now();
  const slug = `e2e-${stamp}`;
  const name = `E2E-${stamp}`;

  const created = await context.request.fetch(`${baseURL}/api/blogpress/posts`, {
    method: 'POST',
    data: { slug, content: name, status: 'draft' },
  });
  const createdBody = (await created.json()) as { id?: string };
  const postId = createdBody.id;
  expect(postId).toBeTruthy();

  const page = await context.newPage();
  // The first online visit caches the document and pulls the post into the
  // Local Store.
  await gotoUnderWorkerControl(page, `${baseURL}/blogpress`);
  await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 30_000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('إجمالي المنشورات')).toBeVisible();
  await expect(page.getByRole('link', { name })).toBeVisible();
  await expectNotOffline(page);

  // Clean up so the suite is idempotent.
  await context.setOffline(false);
  await context.request.fetch(`${baseURL}/api/blogpress/posts/${postId}`, {
    method: 'DELETE',
    data: {},
  });

  await context.close();
});

/**
 * The product subroute that has no document of its own (#490).
 *
 * Every product root is a cached shell (ADR-0073), and each one can have a
 * dynamic child the build cannot precache: `/linksnap/unlock/<code>` here, a
 * password-protected share link opened from a message. Before #490 that deep link
 * was answered with `/offline`; now the worker serves the root the device holds
 * at the URL the user asked for, and the app adds the inline card that says the
 * link itself is not available without a connection.
 */
test('a never-visited product subroute keeps the product chrome and names the missing link', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);

  await gotoUnderWorkerControl(page, `${baseURL}/linksnap`);
  await expect(page.getByRole('heading', { name: 'اختصار الرَّوابط' })).toBeVisible();

  // The root shell arrives from the background refresh (#489); the deep link
  // below is opened for the first time with the radio off.
  await expect
    .poll(() => page.evaluate(() => caches.match('/linksnap').then((hit) => Boolean(hit))), {
      timeout: 90_000,
      intervals: [250, 500, 1000],
    })
    .toBe(true);

  await page.context().setOffline(true);
  await page.goto(`${baseURL}/linksnap/unlock/abc123`, { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/linksnap\/unlock\/abc123$/);
  await expect(page.getByRole('heading', { name: 'اختصار الرَّوابط' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'هذا الرابط غير متاح دون اتصال' })
  ).toBeVisible();
  // The missing item's own screen is the negative control: the unlock form never
  // rendered, which is the part the card is reporting.
  await expect(page.getByRole('heading', { name: 'فتح الرَّابط' })).toHaveCount(0);
  await expectNotOffline(page);
});
