import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * `/athkar` is a prerendered reading surface: the two collections are in the
 * document, and the only state is the day's count on the device. The sitting
 * itself is the URL (ADR-0147): `/athkar` is the morning and `/athkar/evening`
 * the evening, so the browser tests prove the picker still opens it, a count
 * survives a reload, and a shared evening link lands on the evening list.
 */

/** Reach the counter by keyboard, so :focus-visible is the real thing. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error('the counter never received focus');
}

async function openFromMenu(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'التَّطبيقات', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'أذكار الصَّباح والمساء' })
    .getByRole('button', { name: 'إضافة' })
    .click();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('tab', { name: 'أذكار الصَّباح والمساء' }).click();
  // A tab is state on the door (ADR-0151): the address stays `/` and the
  // reader renders under the strip, so opening an app is not a navigation.
  await expect(page).toHaveURL(/\/$/);
}

test('the picker adds athkar to the homepage and opens it', async ({ page }) => {
  await openFromMenu(page);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('أذكار');
  await expect(page.getByRole('tab', { name: 'أذكار الصَّباح' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
});

test('a count survives a reload', async ({ page }) => {
  await page.goto('/athkar');

  const counter = page.getByRole('button', { name: 'عدّ الذكر 2', exact: true });
  await expect(counter).toContainText('0 من 3');
  await counter.click();
  await expect(counter).toContainText('1 من 3');

  await page.reload();

  const restored = page.getByRole('button', { name: 'عدّ الذكر 2', exact: true });
  await expect(restored).toContainText('1 من 3');
});

test('the evening tab is its own URL and survives a reload', async ({ page }) => {
  await page.goto('/athkar');

  await page.getByRole('tab', { name: 'أذكار المساء' }).click();

  await expect(page).toHaveURL(/\/athkar\/evening$/);
  await expect(page.locator('[data-athkar-id="amsayna-wa-amsa-al-mulk"]')).toBeVisible();
  await expect(page.locator('[data-athkar-id="asbahna-wa-asbaha-al-mulk"]')).toHaveCount(0);

  await page.reload();

  // The sitting is the URL (ADR-0147), so a refresh lands where the reader was.
  await expect(page.getByRole('tab', { name: 'أذكار المساء' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('[data-athkar-id="amsayna-wa-amsa-al-mulk"]')).toBeVisible();
});

test('a shared evening link opens the evening sitting', async ({ page }) => {
  await page.goto('/athkar/evening');

  await expect(page.getByRole('tab', { name: 'أذكار المساء' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('[data-athkar-id="asbahna-wa-asbaha-al-mulk"]')).toHaveCount(0);
});

for (const route of ['/athkar', '/athkar/evening']) {
  test(`completion keeps keyboard focus on the counter at ${route}`, async ({ page }) => {
    await page.goto(route);

    const counter = page.getByRole('button', { name: 'عدّ الذكر 1', exact: true });
    // Wait for the device-local count to load: before `ready` the button reads
    // «— من 1», which has no count to parse (#1670).
    await expect(counter).toContainText(/\d+ من \d+/);
    const repeat = Number((await counter.innerText()).match(/(\d+) من (\d+)/)?.[2]);
    expect(repeat).toBeGreaterThan(0);

    await tabTo(page, counter);
    expect(await counter.evaluate((el) => el === document.activeElement)).toBe(true);

    for (let i = 0; i < repeat; i += 1) {
      await page.keyboard.press('Enter');
    }

    // The last count used to turn the button into `disabled`, which took it
    // out of the tab order and moved focus to <body> (#1670).
    expect(await counter.evaluate((el) => el === document.activeElement)).toBe(true);
    await expect(counter).toHaveAttribute('aria-disabled', 'true');
    expect(await counter.getAttribute('disabled')).toBeNull();
    await expect
      .poll(() =>
        counter.evaluate(
          (el) => el.matches(':focus-visible') && getComputedStyle(el).boxShadow !== 'none'
        )
      )
      .toBe(true);
    await expect(counter).toContainText(`${repeat} من ${repeat}`);

    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(counter).toContainText(`${repeat} من ${repeat}`);

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'إعادة عدّ الذكر 1', exact: true })).toBeFocused();
  });
}
