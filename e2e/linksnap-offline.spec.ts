import { test, expect, type Page } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';
import { signIn } from './sign-in';
/**
 * Offline read/write/resume for LinkSnap (#167): the link list renders from the
 * Local Store with the radio off, a link created offline lands in the Outbox and
 * replays once the connection returns, and an offline read keeps working from
 * IndexedDB. Exercises the real service worker, the real endpoints and a real
 * authenticated session.
 *
 * Gated behind LINKSNAP_OFFLINE_E2E=1 because it needs a live Supabase project
 * plus the E2E test user:
 *   Run: LINKSNAP_OFFLINE_E2E=1 npx playwright test e2e/linksnap-offline.spec.ts
 */

const ENABLED = process.env.LINKSNAP_OFFLINE_E2E === '1';

test.skip(!ENABLED, 'requires LINKSNAP_OFFLINE_E2E=1 (live Supabase + auth)');

/**
 * The shortener's submit button, selected by id rather than by its label.
 *
 * The label carries Arabic combining marks, and their order is not consistent
 * across this codebase: the spec used the damma-then-shadda spelling (the
 * Unicode canonical one, and the one `use-shorten.ts` uses in its error copy)
 * while the button renders shadda-then-damma (#337). An exact accessible-name match
 * therefore stopped matching at some point, and every click timed out — which
 * is what "both LinkSnap tests time out" actually was. A stable hook cannot
 * drift like that; assert the copy somewhere it is not the only handle on the
 * behaviour.
 */
const SHORTEN_BUTTON = '#btn-shorten-url';

/**
 * The delete action, matched without its diacritics on purpose.
 *
 * `link-row-card.tsx` spells this label two different ways: the dropdown menu
 * item and the confirm dialog disagree about the order of the same Arabic
 * combining marks. Any exact spelling therefore matches one of them and
 * silently misses the other — and this spec had it right only for the dialog,
 * so the menu item never appeared and both tests timed out waiting for it.
 * Matching the bare letters cannot drift that way (#337).
 */
const DELETE_ACTION = /حذف الر/;

/** Waits until the Local Store is open and the signed-in shortener is ready. */
async function waitReady(page: Page) {
  await expect(page.locator('[data-linksnap-ready="true"]')).toBeAttached();
}

/** Removes a link through the account dashboard (UI), so the E2E user stays clean. */
async function deleteLinkViaUi(page: Page, code: string) {
  const replay = page.waitForResponse(
    (res) => res.url().includes('/linksnap/api/links') && res.request().method() === 'DELETE',
    { timeout: 30_000 }
  );
  await page.getByRole('button', { name: `إجراءات الرَّابط /${code}` }).click();
  await page.getByRole('menuitem', { name: DELETE_ACTION }).click();
  await page.getByRole('dialog').getByRole('button', { name: DELETE_ACTION }).click();
  await replay;
  await expect(page.getByRole('button', { name: `إجراءات الرَّابط /${code}` })).toHaveCount(0);
}

/** Creates a short link through the public shortener while online. */
async function createOnline(page: Page, baseURL: string, url: string, code: string) {
  await gotoUnderWorkerControl(page, `${baseURL}/linksnap`);
  await waitReady(page);
  await expect(page.locator('#custom-code')).toBeVisible();
  await page.locator('#original-url').fill(url);
  await page.locator('#custom-code').fill(code);
  const replay = page.waitForResponse(
    (res) => res.url().endsWith('/linksnap/api/shorten') && res.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await page.locator(SHORTEN_BUTTON).click();
  await expect(page.getByText('رابطك المُختصَر جاهز!')).toBeVisible();
  await replay;
}

test('a link created offline reaches the server after reconnect', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  await signIn(context, baseURL!);

  const code = `e2e${Date.now().toString(36)}`;
  const url = `https://example.com/${code}`;

  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/linksnap`);
  await waitReady(page);
  await expect(page.locator('#custom-code')).toBeVisible();

  // Radio off: the write must land in the Local Store and render from there.
  await context.setOffline(true);
  await page.locator('#original-url').fill(url);
  await page.locator('#custom-code').fill(code);
  await page.locator(SHORTEN_BUTTON).click();
  await expect(page.getByText('رابطك المُختصَر جاهز!')).toBeVisible();
  await expect(page.getByText(url)).toBeVisible();

  // Radio back on: the `online` trigger flushes the Outbox to the server.
  const replay = page.waitForResponse(
    (res) => res.url().endsWith('/linksnap/api/shorten') && res.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await context.setOffline(false);
  const response = await replay;
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { link?: { code?: string } };
  expect(body.link?.code).toBe(code);

  // Clean up through the dashboard so the run stays idempotent.
  await page.goto(`${baseURL}/account/links`, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await deleteLinkViaUi(page, code);

  await context.close();
});

test('the link list renders from the Local Store offline', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  await signIn(context, baseURL!);

  const code = `e2e${Date.now().toString(36)}`;
  const url = `https://example.com/${code}`;

  const page = await context.newPage();
  await createOnline(page, baseURL!, url, code);

  // Open the dashboard online so the Local Store is seeded and cached.
  await gotoUnderWorkerControl(page, `${baseURL}/account/links`);
  await waitReady(page);
  await expect(page.getByText(url)).toBeVisible();

  // Radio off: the list must keep rendering from IndexedDB.
  await context.setOffline(true);
  await expect(page.getByText(url)).toBeVisible();
  await context.setOffline(false);

  await deleteLinkViaUi(page, code);
  await context.close();
});
