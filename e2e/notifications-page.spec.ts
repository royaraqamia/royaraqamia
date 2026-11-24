import { test, expect } from '@playwright/test';
import { signIn } from './sign-in';

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
    await expect(page.getByRole('tablist', { name: 'أقسام الإشعارات' })).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('offers the two tabs, and a guest gets the sign-in prompt', async ({ page }) => {
    await page.goto('/notifications');

    const chats = page.getByRole('tab', { name: /المحادثات/ });
    const alerts = page.getByRole('tab', { name: /التَّنبيهات/ });
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

    await expect(page.getByRole('tab', { name: /التَّنبيهات/ })).toHaveAttribute(
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
    await expect(page.getByRole('tab', { name: /التَّنبيهات/ })).toBeVisible();
    // The old surface became a bottom sheet at this width; a dialog here would be
    // the regression.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

/**
 * The signed-in door the audit measured (#1832): the Chats tab's «محادثة جديدة»
 * FAB is a disclosure, not just a button with a panel behind it. The guest cases
 * above cannot reach it — a guest gets the sign-in prompt instead of the list —
 * so the contract is gated here on the fixture account.
 */
test.describe('notification centre, signed in', () => {
  test.use({ viewport: { width: 393, height: 852 }, colorScheme: 'dark', locale: 'ar' });

  test('the new-conversation launcher is a keyboard disclosure', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD are the fixture account'
    );
    await signIn(context, baseURL!);
    await page.goto('/notifications?tab=chats');

    const launcher = page.getByRole('button', { name: 'محادثة جديدة' });
    const search = page.locator('input[name="chat-member-search"]');
    await expect(launcher).toBeVisible();

    // Closed: the announcement says so, and the control it names is in the DOM
    // even while the panel's contents are not.
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');
    const controls = await launcher.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    await expect(page.locator(`[id="${controls}"]`)).toHaveCount(1);
    await expect(search).toHaveCount(0);

    await launcher.click();
    await expect(launcher).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`[id="${controls}"]`)).toHaveCount(1);
    await expect(search).toHaveCount(1);
    // The press hands the keyboard to the field it revealed; it does not leave
    // it on the launcher with the rest of the document to tab through.
    await expect(search).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');
    await expect(launcher).toBeFocused();

    // While open, the panel is one Tab from the launcher: the button is fixed
    // visually but precedes the panel in the tab order.
    await launcher.click();
    await launcher.focus();
    await page.keyboard.press('Tab');
    await expect(search).toBeFocused();
  });
});
