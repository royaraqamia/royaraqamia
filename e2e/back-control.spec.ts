import { test, expect, type Page } from '@playwright/test';

/**
 * A back press walks the stack the app wrote (ADR-0203).
 *
 * The loop this pins: home → community → home is one tap of the bottom bar
 * away, and it used to push a third browser entry. The trail popped itself on
 * the pathname match, `router.back()` then walked entries in order, and the two
 * pages traded places for as long as the member kept pressing. These are the
 * three ways a member can walk back into where they came from, each asserted
 * against the *browser's* history — not against a mock of it.
 */

const backControl = (page: Page) => page.getByRole('button', { name: 'رجوع', exact: true }).first();

test('the tab bar returns home without stacking a second copy of it', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'المجتمع' }).click();
  await expect(page).toHaveURL(/\/community$/);

  // The second press is a back, not a third entry: the page behind is home.
  await page.getByRole('link', { name: 'الرَّئيسيَّة' }).click();
  await expect(page).toHaveURL(/\/$/);

  // If a third entry had been pushed, this would land back on /community —
  // which is exactly the pair the report saw trading places.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/community$/);
});

test('a page opened cold goes up and leaves nothing to come back to', async ({ page }) => {
  await page.goto('/privacy');
  await expect(backControl(page)).toBeVisible();

  await backControl(page).click();
  await expect(page).toHaveURL(/\/$/);

  // The control replaced the entry it was on, so the page it was pressed on is
  // not one press away — the other half of the same loop.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/privacy$/);
});

test('a page walked to from a tab pops back to it, then goes up', async ({ page }) => {
  // The account area is app chrome; `/pricing` is a drill-down off it, so this
  // is the ordinary in-app walk: tab → page → back.
  await page.goto('/account');
  await page.locator('a[href="/pricing"]').first().click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(backControl(page)).toBeVisible();

  // A page the member walked to is popped, not replaced: the tab they came from
  // is still the screen behind them.
  await backControl(page).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goBack();
  await expect(page).not.toHaveURL(/\/pricing$/);
});
