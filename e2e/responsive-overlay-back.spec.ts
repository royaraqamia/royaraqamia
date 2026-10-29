import { test, expect } from '@playwright/test';

/**
 * The Android back button closes the open dialogue instead of leaving the page
 * it was opened on.
 *
 * The shell answers the hardware press by walking the WebView's history
 * (`MainActivity.installBackExit`), never by handing it to the page, so the
 * dialogue only gets a say if it put an entry there — which is what
 * `frontend/ui/primitives/overlay-back.ts` does. The gesture Chrome fires at
 * these widths is the same traversal, so the same spec covers both.
 *
 * The home testimonial is the public dialogue: no session, no fixture.
 */
test('back closes the dialogue and leaves the page where it was', async ({ page }) => {
  await page.goto('/');

  const card = page.locator('#testimonials [aria-haspopup="dialog"]').first();
  await card.scrollIntoViewIfNeeded();
  await card.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading').first()).toBeAttached();

  const url = page.url();
  const scrollY = await page.evaluate(() => window.scrollY);

  await page.goBack();

  await expect(dialog).toBeHidden();
  expect(page.url()).toBe(url);
  // The page underneath was never navigated, so it did not re-render to the top.
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('the entry does not outlive the dialogue', async ({ page }) => {
  await page.goto('/');

  const card = page.locator('#testimonials [aria-haspopup="dialog"]').first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Closed the way a tap closes it. The guard entry it pushed must go with it,
  // or the next press would be swallowed by an entry with nothing left to close.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  expect(await page.evaluate(() => window.history.state?.__overlayGuard)).toBeUndefined();
});
