import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { localStoreName, userIdentity } from '@/frontend/shared/local-store/identity';
import { gotoUnderWorkerControl } from './worker-control';
import { signIn } from './sign-in';

/**
 * The Android shell's drain page (ADR-0059).
 *
 * The shell has no Background Sync to lean on: its headless WebView loads
 * `/sync-flush.html`, the page replays the Outbox through the same engine a tab
 * uses, and it reports back through the bridge the shell injects. This spec is
 * that half, as close as a browser can come to it: a real production build, a real
 * session, a real queued write, and — the part that matters — the app's page
 * *closed* before the network returns, so nothing but the drain page can deliver
 * it.
 *
 * What it cannot be is the shell itself. The work the worker does (a WorkManager
 * wake, a WebView with no activity, the JavaScript interface) is native and is
 * measured on a device; and the drain's *own* run is the same code path
 * `sw-outbox.ts` covers, which is what makes this spec an honest stand-in rather
 * than a different implementation.
 *
 * Gated behind SYNC_FLUSH_E2E=1 because it needs a live Supabase project plus the
 * E2E test user (and Turnstile unconfigured, as `e2e-offline.yml` arranges):
 *   Run: SYNC_FLUSH_E2E=1 npx playwright test e2e/sync-flush.spec.ts
 */

const ENABLED = process.env.SYNC_FLUSH_E2E === '1';

test.skip(!ENABLED, 'requires SYNC_FLUSH_E2E=1 (live Supabase + auth)');

/** What the shell's `ShellSyncBridge` puts on `window`; the page reports into it. */
declare global {
  interface Window {
    RoyShellSync?: { report: (json: string) => void };
    __shellReport?: string;
  }
}

test('the drain page delivers a write queued with the app closed', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);

  const name = `Flush-${Date.now()}`;
  // A write this device has never seen: made on the server ("device A") after
  // the app's page closed, so the only way into the Local Store is the pull the
  // drain page runs after its replay.
  const remoteName = `DeviceA-${Date.now()}`;

  try {
    const app = await context.newPage();
    await gotoUnderWorkerControl(app, `${baseURL}/habitflow`);
    await expect(app.locator('#btn-create-habit')).toBeVisible();

    // Radio off: the write lands in the Local Store and stays in the Outbox.
    await context.setOffline(true);
    await app.locator('#btn-create-habit').click();
    await app.locator('#input-add-habit-name').fill(name);
    await app.locator('#btn-submit-add-habit').click();
    await expect(app.getByText(name)).toBeVisible();

    // The app closes with the write still owed, and only then does the network come
    // back — so nothing running can deliver it but the drain.
    await app.close();
    await context.setOffline(false);

    const created = await context.request.fetch(`${baseURL}/habitflow/api/habits`, {
      method: 'POST',
      data: { clientId: crypto.randomUUID(), name: remoteName, frequency: 'daily' },
    });
    expect(created.ok()).toBe(true);

    const drain = await context.newPage();
    await drain.addInitScript(() => {
      window.RoyShellSync = {
        report: (json: string) => {
          window.__shellReport = json;
        },
      };
    });
    await drain.goto(`${baseURL}/sync-flush.html`, { waitUntil: 'domcontentloaded' });

    await expect
      .poll(async () => drain.evaluate(() => window.__shellReport ?? null), { timeout: 120_000 })
      .not.toBeNull();

    const report = JSON.parse((await drain.evaluate(() => window.__shellReport)) ?? '{}');
    expect(report.error).toBeNull();
    expect(report.pending).toBe(0);
    const habitflow = report.outcomes?.find(
      (outcome: { product: string }) => outcome.product === 'habitflow'
    );
    expect(habitflow?.replayed).toBeGreaterThanOrEqual(1);

    // The page's `refreshed` count is a claim; the store is the evidence. Read the
    // product's own IndexedDB, which the drain page shares, and find the row only
    // the pull could have delivered. Emptying `PULLABLE_PRODUCTS` makes this fail.
    const database = await signedInHabitStore(context, baseURL!);
    await expect
      .poll(() => localHabitNames(drain, database), { timeout: 60_000 })
      .toContain(remoteName);

    // Server truth, read with the same session the page drained with.
    await expect
      .poll(
        async () => {
          const response = await context.request.fetch(`${baseURL}/habitflow/api/habits`);
          if (!response.ok()) return [];
          const body = (await response.json()) as { habits?: Array<{ name: string }> };
          return (body.habits ?? []).map((habit) => habit.name);
        },
        { timeout: 60_000 }
      )
      .toContain(name);
  } finally {
    // In `finally` because this spec creates both rows on the server: the drained
    // one and the "device A" one. Without the cleanup they accumulated on the
    // shared account until its owned-item cap refused every create (#518's red
    // offline run), and a failed assertion before a `finally` would leak them too.
    await deleteHabits(context, baseURL!, [name, remoteName]);
  }
});

/** Deletes this spec's habits by name; the suite shares one account across runs. */
async function deleteHabits(context: BrowserContext, baseURL: string, names: string[]) {
  const response = await context.request.fetch(`${baseURL}/habitflow/api/habits`);
  if (!response.ok()) return;
  const body = (await response.json()) as { habits?: Array<{ id: string; name: string }> };
  for (const habit of body.habits ?? []) {
    if (!names.includes(habit.name)) continue;
    await context.request.fetch(
      `${baseURL}/habitflow/api/habits?id=${encodeURIComponent(habit.id)}`,
      { method: 'DELETE' }
    );
  }
}

/** The signed-in account's `habitflow__user:<id>` database, named as the app names it. */
async function signedInHabitStore(context: BrowserContext, baseURL: string): Promise<string> {
  const response = await context.request.fetch(`${baseURL}/auth/api/session`);
  expect(response.ok()).toBe(true);
  const { userId } = (await response.json()) as { userId?: unknown };
  if (typeof userId !== 'string') throw new Error('the e2e session has no user id');
  return localStoreName('habitflow', userIdentity(userId));
}

/** Reads the habit rows straight from the product's Local Store. */
function localHabitNames(page: Page, database: string): Promise<string[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const rows = await new Promise<Array<{ name?: string }>>((resolve, reject) => {
        const request = db.transaction('habits', 'readonly').objectStore('habits').getAll();
        request.onsuccess = () => resolve(request.result as Array<{ name?: string }>);
        request.onerror = () => reject(request.error);
      });
      return rows.map((row) => row.name ?? '');
    } finally {
      db.close();
    }
  }, database);
}
