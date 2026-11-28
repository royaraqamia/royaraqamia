import { expect, test } from '@playwright/test';

/**
 * The panel header is the door to `/assistant` (ADR-0224).
 *
 * An open dialogue owns a history entry while it is open (ADR-0095), so a
 * dismissal and a navigation in the same tap are two writes to the history. The
 * traversal that takes the entry back off used to cancel the router's push: the
 * header closed the sheet and the page never changed. The push therefore waits
 * for the drop (`useDismissThenNavigate`), and the URL is what this measures.
 *
 * A guest reaches the door too. The route answers with its sign-in card, which
 * is still the assistant's page, so no fixture is needed.
 */
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2.75,
  colorScheme: 'dark',
  locale: 'ar',
});

test('the header opens /assistant and closes the sheet', async ({ page }) => {
  await page.goto('/');

  await page.locator('[data-assistant-launcher]').click();
  const sheet = page.locator('[data-assistant-panel]');
  await expect(sheet).toBeVisible();

  await sheet.getByRole('link', { name: 'افتح صفحة المساعد' }).click();

  await expect(page).toHaveURL(/\/assistant$/);
  await expect(sheet).toBeHidden();
});
