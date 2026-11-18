import { test, expect, type Page } from '@playwright/test';

/**
 * The shared editor's tools sit under the text on a phone and above it on a
 * desktop (ADR-0109). The two steps are written as variants because the shell
 * does not compile this component: the utilities ship only in the sheets that
 * `@source` it, and a sheet appended later on navigation can otherwise win the
 * property with a bare base class and strip the breakpoint step (ADR-0132).
 *
 * The guest notes composer opens without an account, so the measured element is
 * the same one the post dialog draws. Walking to another surface and back leaves
 * both stylesheets in the document, which is the order a cold reload cannot
 * reproduce.
 */

async function openAfterNavigation(page: Page) {
  await page.goto('/?tab=/notes');
  await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

  await page.locator('nav[data-bottom-tabbar] a[href="/community"]').click();
  await expect(page).toHaveURL(/\/community$/);
  await page.goBack();
  await expect(page).toHaveURL(/\?tab=\/notes$/);
  await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

  await page.locator('#btn-new-note').dispatchEvent('click');
  await expect(page.locator('#composer-note-body')).toBeVisible();
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-slot="dialog-content"] [role="toolbar"]');
    const text = document.querySelector('#composer-note-body');
    if (!toolbar || !text || !toolbar.parentElement) throw new Error('composer is not open');
    const bar = toolbar.getBoundingClientRect();
    const field = text.getBoundingClientRect();
    const style = getComputedStyle(toolbar);
    return {
      below: bar.y > field.y,
      direction: getComputedStyle(toolbar.parentElement).flexDirection,
      top: style.borderTopWidth,
      bottom: style.borderBottomWidth,
    };
  });
}

test.describe('the composer toolbar after a client-side navigation', () => {
  test.describe('on a phone', () => {
    test.use({ viewport: { width: 393, height: 852 } });

    test('sits under the text with a top divider', async ({ page }) => {
      await openAfterNavigation(page);
      const measured = await geometry(page);

      expect(measured.below).toBe(true);
      expect(measured.direction).toBe('column-reverse');
      expect(measured.top).not.toBe('0px');
      expect(measured.bottom).toBe('0px');
    });
  });

  test.describe('on a desktop', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('sits above the text with a bottom divider', async ({ page }) => {
      await openAfterNavigation(page);
      const measured = await geometry(page);

      expect(measured.below).toBe(false);
      expect(measured.direction).toBe('column');
      expect(measured.top).toBe('0px');
      expect(measured.bottom).not.toBe('0px');
    });
  });
});
