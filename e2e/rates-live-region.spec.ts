import { expect, test } from '@playwright/test';

/**
 * WCAG 2.2 4.1.3 (Status Messages, #1742): the answer the converter rewrites has
 * to be programmatically determinable without moving focus out of the amount
 * field. The result box is the one status both cards draw, and it settles once
 * per typed value so a screen reader hears one answer, not one per character.
 */

interface StatusChangesWindow extends Window {
  __ratesStatusChanges?: number;
}

test('the conversion result is an announced status', async ({ page }) => {
  await page.goto('/rates');

  const result = page.locator('[data-visual="result"]');
  await expect(result).toHaveAttribute('role', 'status');
  await expect(result).toHaveAttribute('aria-live', 'polite');
  await expect(result).toHaveAttribute('aria-atomic', 'true');

  const before = (await result.textContent())?.trim();
  await page.locator('#rates-amount').fill('2500');
  await expect.poll(async () => (await result.textContent())?.trim()).not.toBe(before);

  expect(await result.ariaSnapshot()).toContain('- status');
  await expect(page.locator('[data-visual="metal-result"]')).toHaveAttribute('role', 'status');
});

test('four typed characters settle into one announcement', async ({ page }) => {
  await page.goto('/rates');

  const amount = page.locator('#rates-amount');
  const status = page.locator('[data-visual="result"][role="status"]');

  await amount.fill('');
  // Let the change from clearing the field settle before counting anything.
  await page.waitForTimeout(400);
  const before = (await status.textContent())?.trim();

  await page.evaluate(() => {
    const node = document.querySelector('[data-visual="result"][role="status"]');
    if (!node) throw new Error('the result box is not a status region');
    const observed = window as StatusChangesWindow;
    observed.__ratesStatusChanges = 0;
    new MutationObserver(() => {
      observed.__ratesStatusChanges = (observed.__ratesStatusChanges ?? 0) + 1;
    }).observe(node, { childList: true, characterData: true, subtree: true });
  });

  await amount.pressSequentially('2500');
  await expect.poll(async () => (await status.textContent())?.trim()).not.toBe(before);

  const changes = await page.evaluate(
    () => (window as StatusChangesWindow).__ratesStatusChanges ?? 0
  );
  expect(changes).toBe(1);
});
