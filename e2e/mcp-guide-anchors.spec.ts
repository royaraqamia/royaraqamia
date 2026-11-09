import { test, expect } from '@playwright/test';

/**
 * The guide's steps are addressable (ADR-0147): `#install`, `#connect` and the
 * per-client sections survive a refresh and can be shared. The section must land
 * clear of the fixed top bar, hence the scroll margin.
 */

test('a step is reachable by its own hash', async ({ page }) => {
  await page.goto('/mcp/guide#install');
  const install = page.locator('#install');
  await expect(install).toBeVisible();
  await expect(install.getByRole('heading', { name: 'عنوان الخادم' })).toBeVisible();
  // The fixed nav is 64px: a heading under it is not the screen the link names.
  const top = (await install.boundingBox())?.y ?? 0;
  expect(top).toBeGreaterThanOrEqual(56);
});

test('the connect step has its own hash too', async ({ page }) => {
  await page.goto('/mcp/guide#connect');
  await expect(page.locator('#connect')).toBeVisible();
  await expect(
    page.locator('#connect').getByRole('heading', { name: 'Claude Code' })
  ).toBeVisible();
});
