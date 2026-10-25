import { test, expect } from '@playwright/test';

/**
 * The expanded testimonial is a lazy chunk now: the dialog primitive mounts on
 * the first open and stays mounted, so closing still animates out and reopening
 * never refetches. The card is the trigger it always was -- nothing about the
 * carousel's markup changed -- so this spec guards the boundary, not the style.
 */
test('the expanded testimonial opens, closes and reopens', async ({ page }) => {
  await page.goto('/');

  const card = page.locator('#testimonials [aria-haspopup="dialog"]').first();
  await card.scrollIntoViewIfNeeded();
  await card.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading').first()).toBeAttached();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await card.click();
  await expect(dialog).toBeVisible();
});
