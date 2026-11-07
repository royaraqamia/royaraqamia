import { test, expect } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';
import { signIn } from './sign-in';

/**
 * Chats read from the device (#1033): once a conversation has been opened, the
 * list and the thread paint from `chats__<identity>` before the API answers, so
 * a reload whose read cannot complete still shows the same rows — and a line
 * written while the read is cut is queued where it is written, marked «قيد
 * الإرسال», and still there after the next reload.
 *
 * The read is cut at the page's own `fetch` rather than with `setOffline(true)`,
 * because the radio also takes the document: `/notifications` and `/chats/<id>`
 * are `force-dynamic`, so the worker has no shell to serve and a radio-off reload
 * lands on the nearest cached ancestor instead of this screen. What this spec
 * holds is the half #1033 owns — the answered read is written down, a failed one
 * is answered from what was written, and a write is durable before it is sent —
 * and the route's offline shell is its own decision.
 *
 * Gated behind CHATS_OFFLINE_E2E=1 because it needs a live Supabase project plus
 * the E2E test user:
 *   CHATS_OFFLINE_E2E=1 npx playwright test e2e/chats-offline.spec.ts
 */

const ENABLED = process.env.CHATS_OFFLINE_E2E === '1';

test.skip(!ENABLED, 'requires CHATS_OFFLINE_E2E=1 (live Supabase + auth)');

/** Makes every chats read fail, from the first script the document runs. */
async function cutChatReads(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/chats')) return Promise.reject(new TypeError('offline'));
      return original(input, init);
    };
  });
}

test('the chat list reloads from the device when the read cannot answer', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);

  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/notifications?tab=chats`);

  const rows = page.locator('a[href^="/chats/"]');
  if ((await rows.count()) === 0) {
    test.skip(true, 'the E2E account has no conversation to cache');
  }
  const title = await rows.first().getAttribute('href');
  expect(title).toBeTruthy();

  // The read answered once, which is what writes the list down.
  await cutChatReads(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('a[href^="/chats/"]').first()).toBeVisible();
  // The skeleton is the bug this closes: the rows were on the device the whole
  // time, so the tab may not wait for the session or the read to paint.
  await expect(page.locator('[data-local-store-skeleton]')).toHaveCount(0);

  await context.close();
});

test('a thread reloads the same bubbles from the device', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);

  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/notifications?tab=chats`);

  const rows = page.locator('a[href^="/chats/"]');
  if ((await rows.count()) === 0) {
    test.skip(true, 'the E2E account has no conversation to cache');
  }

  await rows.first().click();
  await expect(page).toHaveURL(/\/chats\//);

  const bubbles = page.locator('[data-chat-message]');
  if ((await bubbles.count()) === 0) {
    test.skip(true, 'the conversation has no messages to cache');
  }
  const newest = await bubbles.last().getAttribute('data-chat-message');
  expect(newest).toBeTruthy();

  await cutChatReads(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // The same line, from the store, with the composer still in place.
  await expect(page.locator(`[data-chat-message="${newest}"]`)).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'نص الرسالة' });
  await expect(composer).toBeVisible();

  // A line written while the read cannot answer is kept and queued (#1033):
  // the composer clears because the write is durable, and the bubble says the
  // outbox still owes it to the server.
  const draft = `E2E-${Date.now()}`;
  await composer.fill(draft);
  await page.getByRole('button', { name: 'إرسال' }).click();
  await expect(page.locator(`[data-chat-message]`).getByText(draft)).toBeVisible();
  await expect(page.getByText('قيد الإرسال').last()).toBeVisible();

  // A file is stored with the line that carries it, not after it (#1033): the
  // composer accepts the pick while the API is cut, and the chip draws from the
  // device until the outbox has uploaded the bytes.
  const fileName = `E2E-${Date.now()}.txt`;
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('queued offline'),
  });
  await page.getByRole('button', { name: 'إرسال' }).click();
  await expect(page.locator(`[data-chat-message]`).getByText(fileName)).toBeVisible();

  // Durable, not just on screen: the queued line and its file survive the reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(`[data-chat-message]`).getByText(draft)).toBeVisible();
  await expect(page.locator(`[data-chat-message]`).getByText(fileName)).toBeVisible();

  await context.close();
});
