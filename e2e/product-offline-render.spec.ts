import { test, expect, type Page } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';
import { signIn } from './sign-in';

/**
 * The offline-render drill for the five product dashboards (#449, ADR-0073).
 *
 * Before Phase 2 every one of these roots was `force-dynamic` and on the
 * worker's never-cache list, so a reload with the radio off landed on a
 * different screen. The drill is the promise in the issue: visit the root once
 * online, reload it offline, and assert the product's own chrome — and, where
 * the root shows owned rows, the row written while offline.
 *
 * Since #493 it also asserts the other half of that promise: the rows are the
 * session-independent part, so no product may show its dashboard skeleton on
 * that reload. `expectNoStoreSkeleton` is what holds the boot identity to
 * `useLocalIdentity` instead of `getSession()`.
 *
 * Gated behind PRODUCT_OFFLINE_E2E=1 because it needs a live Supabase project
 * plus the E2E test user:
 *   PRODUCT_OFFLINE_E2E=1 npx playwright test e2e/product-offline-render.spec.ts
 */

const ENABLED = process.env.PRODUCT_OFFLINE_E2E === '1';

test.skip(!ENABLED, 'requires PRODUCT_OFFLINE_E2E=1 (live Supabase + auth)');

/** No withdrawn offline card: a prefix-served shell paints silently. */
async function expectNoOfflineNotice(page: Page) {
  await expect(page.getByText('هذا الرابط غير متاح دون اتصال')).toHaveCount(0);
}

/**
 * The dashboard skeleton is the bug (#493), not the cost of a slow disk: it only
 * renders while the product waits for the session to say whose store to open.
 * The rows are on screen by the time this is called, so a skeleton still in the
 * tree means the gate is back.
 *
 * Every product skeleton carries `data-local-store-skeleton`; matching the
 * Arabic label instead would break the day the copy changes.
 */
async function expectNoStoreSkeleton(page: Page) {
  await expect(page.locator('[data-local-store-skeleton]')).toHaveCount(0);
}

/** The product pill's offline state: the connection is named, not implied. */
async function expectOfflinePill(page: Page) {
  // HabitFlow's own sync pill is the surface that names the connection, so take
  // the first `status` that carries the copy rather than demanding a single one.
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
  await expectNoStoreSkeleton(page);
  await expectNoOfflineNotice(page);

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
  await expectNoStoreSkeleton(page);
  await expectNoOfflineNotice(page);

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
  await expectNoStoreSkeleton(page);
  await expectOfflinePill(page);
  await expectNoOfflineNotice(page);

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
  await expectNoStoreSkeleton(page);
  await expectNoOfflineNotice(page);

  // Clean up so the suite is idempotent.
  await context.setOffline(false);
  await context.request.fetch(`${baseURL}/api/blogpress/posts/${postId}`, {
    method: 'DELETE',
    data: {},
  });

  await context.close();
});

/**
 * The fifth Local-Store product, and the one whose bug was the mirror image
 * (#493).
 *
 * Quran derived its partition from `useSession().user`, so an offline reload
 * painted `quran__guest` first and reopened on `user:<id>` when the session
 * arrived — a guest row flash, a store reopen, and a reading position reset
 * mid-read. The partition now comes from the remembered identity, so the store
 * that opens is the account's, on the first render.
 */
test('Quran reloads offline in the remembered identity', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);

  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/quran/2`);

  // `data-quran-signed-in` is the reader's own claim about which store it opened.
  const status = page.locator('[data-quran-ready="true"][data-quran-signed-in="true"]');
  await expect(status).toBeAttached();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // The account's store, not the guest's — with the radio off, so the session
  // check has nothing to reach and only the remembered identity can answer.
  await expect(page.locator('[data-quran-signed-in="true"]')).toBeAttached();
  await expectNoStoreSkeleton(page);
  await expectNoOfflineNotice(page);

  // The reading position is the row the reopen used to lose: the surah's own
  // chrome is painted from the same store.
  await expect(page.locator('[data-quran-ready="true"]')).toBeAttached();

  await context.close();
});

/**
 * The product subroute that has no document of its own (#490).
 *
 * Every product root is a cached shell (ADR-0073), and each one can have a
 * dynamic child the build cannot precache: `/linksnap/unlock/<code>` here, a
 * password-protected share link opened from a message. Before #490 that deep link
 * was answered with a different screen; now the worker serves the root the device
 * holds at the URL the user asked for, silently, and the unlock form itself is
 * simply not there.
 */
test('a never-visited product subroute keeps the product chrome', async ({ page, baseURL }) => {
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
  await expectNoOfflineNotice(page);
  // The missing item's own screen is the negative control: the unlock form never
  // rendered.
  await expect(page.getByRole('heading', { name: 'فتح الرَّابط' })).toHaveCount(0);
});

test('Notes reloads offline and keeps the note written with the radio off', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  await signIn(context, baseURL!);

  // A note is its body (ADR-0110), so the marker the reload is drilled against
  // is the text itself.
  const marker = `E2E-${Date.now()}`;
  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/notes`);
  await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

  // Warm the editor's chunk while online, then write with the radio off.
  await page.locator('#btn-new-note').click();
  await expect(page.locator('#composer-note-body')).toBeVisible();
  await context.setOffline(true);
  await page.locator('#composer-note-body').click();
  await page.keyboard.type(marker);
  await page.getByRole('button', { name: 'إنشاء الملاحظة' }).click();
  await expect(page.locator('#note-body')).toContainText(marker);
  await page.waitForTimeout(900);

  // The reload is the drill: the cached document paints the same note.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/notes\?note=/);
  await expect(page.getByRole('heading', { name: 'الملاحظات' })).toBeVisible();
  await expect(page.locator('#note-body')).toContainText(marker);
  await expectNoStoreSkeleton(page);
  await expectOfflinePill(page);
  await expectNoOfflineNotice(page);

  // Clean up so the suite is idempotent.
  await context.setOffline(false);
  await expect
    .poll(
      async () => {
        const res = await context.request.fetch(`${baseURL}/notes/api/sync`);
        if (!res.ok()) return [];
        const body = (await res.json()) as { notes?: Array<{ id: string; body: string }> };
        return body.notes ?? [];
      },
      { timeout: 30_000 }
    )
    .toEqual(expect.arrayContaining([expect.objectContaining({ body: marker })]));

  const res = await context.request.fetch(`${baseURL}/notes/api/sync`);
  const body = (await res.json()) as { notes?: Array<{ id: string; body: string }> };
  const created = (body.notes ?? []).find((note) => note.body === marker);
  if (created) {
    await context.request.fetch(`${baseURL}/notes/api/notes/${created.id}`, {
      method: 'DELETE',
      data: {},
    });
  }

  await context.close();
});
