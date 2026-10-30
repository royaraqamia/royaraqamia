import { test, expect } from '@playwright/test';

/**
 * The notification centre is a page at every width (the bell used to open a
 * popover that a phone turned into a bottom sheet). This spec pins the move: the
 * bell is a link, the destination is a document with two tabs, and `?tab=` picks
 * one. It runs signed out on purpose — the page answers a guest with a sign-in
 * prompt, which is the state a shared link lands in.
 */

test.describe('notification centre', () => {
  test('the bell is a link to the page, not a panel trigger', async ({ page }) => {
    await page.goto('/');

    const bell = page.locator('a[aria-label^="الإشعارات"]').first();
    await expect(bell).toHaveAttribute('href', '/notifications');

    await bell.click();
    await page.waitForURL('**/notifications');
    await expect(page.getByRole('heading', { name: 'الإشعارات' })).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('offers the two tabs, and a guest gets the sign-in prompt', async ({ page }) => {
    await page.goto('/notifications');

    const chats = page.getByRole('tab', { name: /المحادثات/ });
    const alerts = page.getByRole('tab', { name: /التنبيهات/ });
    await expect(chats).toBeVisible();
    await expect(alerts).toBeVisible();

    // Nothing is unread for a guest, so the page opens on Chats.
    await expect(chats).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('سجِّل الدُّخول لمتابعة إشعاراتك')).toBeVisible();
    await expect(page.getByRole('link', { name: 'تسجيل الدُّخول' })).toHaveAttribute(
      'href',
      /\/auth\/login\?redirect=%2Fnotifications/
    );
  });

  test('a ?tab= link selects its tab and survives a reload', async ({ page }) => {
    await page.goto('/notifications?tab=alerts');

    await expect(page.getByRole('tab', { name: /التنبيهات/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await page.getByRole('tab', { name: /المحادثات/ }).click();
    await expect(page).toHaveURL(/tab=chats/);

    await page.reload();
    await expect(page.getByRole('tab', { name: /المحادثات/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('stays a page, with both tabs, on a 320px phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/notifications');

    await expect(page.getByRole('tab', { name: /المحادثات/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /التنبيهات/ })).toBeVisible();
    // The old surface became a bottom sheet at this width; a dialog here would be
    // the regression.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});
