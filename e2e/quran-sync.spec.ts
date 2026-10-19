import { test, expect, type APIRequestContext } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';

/**
 * Offline read/write/resume for the Quran Reader (ADR-0056): a mark made with
 * the network off lands in the Local Store, the reader keeps reading, and the
 * Outbox replays it to the account once the connection returns. Exercises the
 * real service worker, the real endpoint and a real authenticated session.
 *
 * The claim, the merge and the engine are unit-tested; what only this proves is
 * that a press while offline becomes a row on the server afterwards.
 *
 * Gated behind QURAN_SYNC_E2E=1 because it needs a live Supabase project plus
 * the E2E test user:
 *   Run: QURAN_SYNC_E2E=1 npx playwright test e2e/quran-sync.spec.ts
 */

const ENABLED = process.env.QURAN_SYNC_E2E === '1';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;

test.skip(!ENABLED, 'requires QURAN_SYNC_E2E=1 (live Supabase + auth)');

/** Ayat al-Kursi: a mark worth keeping, and one every sura page can reach. */
const MARK = { surah: 2, ayah: 255 };

interface SyncBody {
  bookmarks: Array<{ surah: number; ayah: number; deletedAt: string | null }>;
}

/** The account's standing mark on that Ayah, or null. */
async function serverMark(
  request: APIRequestContext,
  baseURL: string
): Promise<{ surah: number; ayah: number } | null> {
  const response = await request.fetch(`${baseURL}/quran/api/sync`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as SyncBody;
  return (
    body.bookmarks.find(
      (row) => row.surah === MARK.surah && row.ayah === MARK.ayah && !row.deletedAt
    ) ?? null
  );
}

/** Writes the mark, or its tombstone, through the same route the reader uses. */
async function writeMark(
  request: APIRequestContext,
  baseURL: string,
  deletedAt: string | null
): Promise<void> {
  const response = await request.fetch(`${baseURL}/quran/api/bookmarks`, {
    method: 'POST',
    data: {
      ...MARK,
      deletedAt,
      updatedAt: new Date().toISOString(),
      clientId: crypto.randomUUID(),
    },
  });
  expect(response.ok()).toBeTruthy();
}

test('a mark made offline reaches the account after reconnect', async ({ browser, baseURL }) => {
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

  // Start unmarked whatever an interrupted run left behind: the press toggles,
  // so a standing mark would make this run's press an unmark.
  if (await serverMark(context.request, baseURL!)) {
    await writeMark(context.request, baseURL!, new Date().toISOString());
  }

  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/quran/2`);

  // The store is open, so a press has somewhere durable to land.
  await expect(page.locator('[data-quran-ready="true"]')).toBeAttached();

  const mark = page.getByRole('button', { name: 'علامة على الآية ٢٥٥' });
  await expect(mark).not.toBeDisabled();
  await expect(mark).toHaveAttribute('aria-pressed', 'false');

  // Radio off: the press must land in the Local Store, paint, and say it is
  // waiting — never fail because the network is gone.
  await context.setOffline(true);
  await mark.click();
  await expect(mark).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-quran-ready="true"]').getByText(/عملية معلقة/)).toBeVisible();

  // Radio back on: the `online` trigger flushes the Outbox.
  await context.setOffline(false);

  await expect
    .poll(async () => (await serverMark(context.request, baseURL!)) !== null, { timeout: 30_000 })
    .toBe(true);

  // Clean up so the suite is idempotent.
  await writeMark(context.request, baseURL!, new Date().toISOString());

  await context.close();
});
