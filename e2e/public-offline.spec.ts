import { test, expect } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';

/**
 * Public-content offline read (#170): a previously visited public route paints
 * from the service-worker cache with the network off, the offline indicator
 * reports how old that cached copy is, and Rates keeps its live-fed snapshot
 * read-only with refresh disabled.
 *
 * Exercises the real service worker and the real app. Gated behind
 * PUBLIC_OFFLINE_E2E=1 because the worker is only registered outside
 * development (`PWAProvider`) and dev responses are not cacheable, so this must
 * run against a production build:
 *   npm run build && npm run start
 *   PUBLIC_OFFLINE_E2E=1 npx playwright test e2e/public-offline.spec.ts
 */

const ENABLED = process.env.PUBLIC_OFFLINE_E2E === '1';

test.skip(!ENABLED, 'requires PUBLIC_OFFLINE_E2E=1 (production build)');

test('a visited public page paints from cache offline and shows its age', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // First load registers the worker and the app replaces the document when it
  // claims the page; the helper returns with that reload already applied.
  await gotoUnderWorkerControl(page, `${baseURL}/rates`);
  await expect(page.getByRole('heading', { name: /أسعار الصَّرف/ })).toBeVisible();

  // Radio off: the reload must be served from the service-worker cache.
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /أسعار الصَّرف/ })).toBeVisible();

  const offlineIndicator = page.getByRole('status').filter({ hasText: 'غير متَّصل' });
  await expect(offlineIndicator).toBeVisible();
  await expect(offlineIndicator).toContainText('نسخة محفوظة');

  // Rates are a live-fed snapshot (ADR-0031): the board is read-only offline, and
  // nothing offers to refresh it. The page renders no refresh control at all — by
  // design, not by omission: refreshing is server-owned (the cron route plus
  // refresh-on-read), so what is held here is the absence of the affordance, not a
  // disabled button. The offline state itself is the shared ConnectivityIndicator
  // asserted above.
  await expect(page.locator('#main-content').getByRole('button', { name: /تحديث/ })).toHaveCount(0);

  await context.close();
});
