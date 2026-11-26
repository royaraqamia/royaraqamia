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
 * The signed-in shape after #1860: the Chats tab keeps the assistant and the
 * member's threads, and the one way into a conversation with a person is that
 * person's profile. The picker the audit measured - four threads, five messages
 * in 25 days - is gone, so the tab's accessible name no longer offers
 * «محادثة جديدة» and no member search sits behind it. The guest cases above
 * cannot reach this shape: a guest gets the sign-in prompt instead of the list,
 * so both contracts here are gated on the fixture account.
 */
test.describe('notification centre, signed in', () => {
  test.use({ viewport: { width: 393, height: 852 }, colorScheme: 'dark', locale: 'ar' });

  test.beforeEach(async ({ context, baseURL }) => {
    test.skip(
      !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD are the fixture account'
    );
    await signIn(context, baseURL!);
  });

  test('the chats tab has no member search and no new-chat action', async ({ page }) => {
    await page.goto('/notifications?tab=chats');

    await expect(page.getByRole('tabpanel')).toBeVisible();
    // The whole tab, not just its panel: the FAB used to be a fixed button that
    // sat outside the rows and named a search behind an aria-controls id.
    await expect(page.getByRole('button', { name: 'محادثة جديدة' })).toHaveCount(0);
    await expect(page.locator('input[name="chat-member-search"]')).toHaveCount(0);
    await expect(page.locator('[id="chats-new-conversation-panel"]')).toHaveCount(0);
  });

  test("a member profile offers «راسلني» and lands on that member's chat", async ({ page }) => {
    await page.goto('/community');
    const rail = page.getByRole('region', { name: 'أعضاء المجتمع' });
    const other = rail
      .getByRole('listitem')
      .filter({ hasNotText: 'أنت' })
      .getByRole('link')
      .first();
    const href = await other.getAttribute('href');
    test.skip(!href?.startsWith('/u/'), 'no other member is listed (run e2e/setup-test-user.ts)');

    // Click through rather than `goto`: the profile is a link the member can
    // follow, and a dev-server reload would abort a full navigation here.
    await other.click();
    const cta = page.getByRole('link', { name: 'راسلني' });
    await expect(cta).toBeVisible();
    const handle = href!.slice('/u/'.length);
    await expect(cta).toHaveAttribute('href', `/chats/new?to=${handle}`);

    await cta.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === '/chats/new' && url.searchParams.get('to') === handle
    );
  });
});
