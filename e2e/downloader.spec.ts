import { test, expect } from '@playwright/test';

/**
 * End-to-end proof of the `/downloader` path with the Media Provider stubbed in
 * place: a public link is accepted, dispatched, and completed through the real
 * signed callback route, ending in a downloadable file.
 *
 * Gated behind DOWNLOADER_E2E=1 because it needs a working environment:
 *   - the `download_jobs` migration applied to the Supabase project,
 *   - `DOWNLOADER_CALLBACK_SECRET` set (the stub signs its callback with it),
 *   - `NEXT_PUBLIC_SITE_URL` pointing at the app origin, so the stub's callback
 *     URL stays local,
 *   - `DOWNLOADER_PROVIDER_URL` unset, so the in-repo stub handles the job,
 *   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` unset (or Cloudflare's always-pass test
 *     key), so no widget blocks the submit.
 * Run: DOWNLOADER_E2E=1 npx playwright test e2e/downloader.spec.ts
 */

const ENABLED = process.env.DOWNLOADER_E2E === '1';

test.skip(!ENABLED, 'requires DOWNLOADER_E2E=1 (Supabase + stub-provider env)');

test('a public link becomes a downloadable file through the signed callback', async ({ page }) => {
  await page.goto('/downloader');

  await page.getByLabel('الرَّابط').fill('https://example.com/watch?v=1');

  // The save starts automatically once the job is ready, so arm the listener
  // before the status flips — there is no separate "save" button to click.
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });

  await page.getByRole('button', { name: 'ابدأ التنزيل' }).click();
  await expect(page.getByText('الحالة: جاهز للتنزيل')).toBeVisible({ timeout: 30_000 });

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/royaraqamia-/);
});
