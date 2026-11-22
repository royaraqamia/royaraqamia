import { test, expect } from '@playwright/test';

/**
 * #1743: a failed rates read used to be a sentence with nothing to press. The
 * door's tab owns the read (`/?tab=/rates`), so a 500 from `/api/rates/board`
 * must land on a face that announces the failure and offers the one retry that
 * re-runs the read — the same affordance the app gives the same sentence.
 */
test('a failed rates read offers one retry that renders the converter', async ({ page }) => {
  let fail = true;
  await page.route('**/api/rates/board', async (route) => {
    if (fail) {
      await route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
    } else {
      await route.continue();
    }
  });

  await page.goto('/?tab=/rates');

  const notice = page.getByRole('status').filter({ hasText: 'تعذَّر تحميل الأسعار' });
  await expect(notice).toBeVisible();
  await expect(notice.locator('button, a, input, select, textarea')).toHaveCount(1);

  fail = false;
  await notice.getByRole('button').click();
  await expect(page.locator('#rates-to')).toBeVisible();
});
