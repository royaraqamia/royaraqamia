import { test, expect } from '@playwright/test';
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
});
