import { test, expect } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';
import { signIn } from './sign-in';

/**
 * Chats read from the device with the radio off (#1033, #1128): the list and the
 * thread paint from `chats__<identity>` before the API answers, and the
 * document they paint into is the worker's.
 *
 * `/notifications` and `/chats/[id]` are data-free shells Next rendered per
 * request, so the worker stores their documents through its runtime-cache
 * exception (`isRuntimeShell`) even though the response says `no-store`. The
 * first full load of each is what puts it on the device; a client-side
 * navigation caches only the RSC payload, which is why the thread's URL is
 * opened directly rather than clicked through.
 *
 * The line written while the radio is off is queued where it is written, marked
 * «قيد الإرسال», survives the next reload, and reaches the server when the radio
 * returns: the server's row replaces the local twin and the marker goes.
 *
 * Gated behind CHATS_OFFLINE_E2E=1 because it needs a live Supabase project plus
 * the E2E test user and the chats fixture `e2e/setup-test-user.ts` creates:
 *   CHATS_OFFLINE_E2E=1 npx playwright test e2e/chats-offline.spec.ts
 */

const ENABLED = process.env.CHATS_OFFLINE_E2E === '1';

test.skip(!ENABLED, 'requires CHATS_OFFLINE_E2E=1 (live Supabase + auth)');

/**
 * The thread `e2e/setup-test-user.ts` creates. The list pins the assistant
 * first, so the row is chosen by the peer's name rather than by its position.
 */
const FIXTURE_PEER = 'E2E Peer';

test('the chat list reloads from the device with the radio off', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);

  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/notifications?tab=chats`);

  const rows = page.locator('a[href^="/chats/"]').filter({ hasText: FIXTURE_PEER });
  if ((await rows.count()) === 0) {
    test.skip(true, 'the chats fixture is missing (run e2e/setup-test-user.ts)');
  }

  // The first load put the document and the rows on the device. The reload now
  // has neither a radio nor an API, and must still be this screen.
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(
    page.locator('a[href^="/chats/"]').filter({ hasText: FIXTURE_PEER }).first()
  ).toBeVisible();
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

  const rows = page.locator('a[href^="/chats/"]').filter({ hasText: FIXTURE_PEER });
  if ((await rows.count()) === 0) {
    test.skip(true, 'the chats fixture is missing (run e2e/setup-test-user.ts)');
  }

  // A document load, not the click: a client navigation caches the RSC payload
  // and leaves the thread without a document to answer a reload with.
  const href = await rows.first().getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(`${baseURL}${href}`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/chats\//);

  const bubbles = page.locator('[data-chat-message]');
  if ((await bubbles.count()) === 0) {
    test.skip(true, 'the conversation has no messages to cache');
  }
  const newest = await bubbles.last().getAttribute('data-chat-message');
  expect(newest).toBeTruthy();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // The same line, from the store, in the thread's own cached document, with
  // the composer still in place.
  await expect(page.locator(`[data-chat-message="${newest}"]`)).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'اكتب رسالتك' });
  await expect(composer).toBeVisible();

  // A line written with no radio is kept and queued (#1033): the composer clears
  // because the write is durable, and the bubble says the outbox still owes it.
  const draft = `E2E-${Date.now()}`;
  await composer.fill(draft);
  await page.getByRole('button', { name: 'إرسال' }).click();
  await expect(page.locator('[data-chat-message]').getByText(draft)).toBeVisible();
  await expect(page.getByText('قيد الإرسال').last()).toBeVisible();

  // A file is stored with the line that carries it, not after it (#1033): the
  // composer accepts the pick while the radio is off, and the chip draws from
  // the device until the outbox has uploaded the bytes.
  const fileName = `E2E-${Date.now()}.txt`;
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('queued offline'),
  });
  await page.getByRole('button', { name: 'إرسال' }).click();
  await expect(page.locator('[data-chat-message]').getByText(fileName)).toBeVisible();

  // Durable, not just on screen: the queued line and its file survive the reload,
  // still with no radio.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const queuedBubble = page.locator('[data-chat-message]').filter({ hasText: draft });
  await expect(queuedBubble).toBeVisible();
  await expect(page.locator('[data-chat-message]').getByText(fileName)).toBeVisible();
  const queuedId = await queuedBubble.getAttribute('data-chat-message');

  // The radio returns. The thread's mount flushes its queue, the server accepts
  // the line and its file, and the server's row replaces the local twin: the
  // queued marker goes, the words stay, and the id is no longer the client's.
  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const sentBubble = page.locator('[data-chat-message]').filter({ hasText: draft });
  await expect(sentBubble).toBeVisible();
  await expect(sentBubble.getByText('قيد الإرسال')).toHaveCount(0);
  await expect(sentBubble.getByText(fileName)).toBeVisible();
  expect(await sentBubble.getAttribute('data-chat-message')).not.toBe(queuedId);

  await context.close();
});
