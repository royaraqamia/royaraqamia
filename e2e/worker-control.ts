import type { Page } from '@playwright/test';

/**
 * Loads `path` and leaves the document under service-worker control, with the
 * worker's takeover already applied.
 *
 * The first load registers the worker and `clients.claim()` hands it the page a
 * moment later — and the app then replaces the document, because a document
 * served straight from the network is the previous build as far as it knows
 * (ADR-0039; `sw-update.ts` applies the swap on any controllerchange). A spec
 * that starts interacting inside that window loses whatever it has open: a
 * dialog closes under it, a `fill` hangs, and the failure looks like a missing
 * element rather than a reload. Waiting for the claim and then reloading
 * deliberately puts the document on the worker's build with nothing pending —
 * which is also what the offline pass needs, since the reload is what caches the
 * app chunks the worker serves later.
 */
export async function gotoUnderWorkerControl(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30_000,
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}
