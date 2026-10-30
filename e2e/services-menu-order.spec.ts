import { test, expect, type Page } from '@playwright/test';

/**
 * The خدماتنا sheet is the visitor's own shortlist: rows can be dragged, a
 * touch holds a row to pick it up, and the order is remembered on the device.
 *
 * The drag is measured, not simulated: jsdom has no layout, so the pointer
 * arithmetic in `use-services-order` is only ever proven here — a real grip, a
 * real row height and a real mouse travel between two slots.
 */
const ROW = '[data-services-row]';
const ORDER_KEY = 'rr:services-order:v1';

async function openMenu(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'خدماتنا', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The sheet slides in; measuring a row mid-animation measures the animation.
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });

  return dialog;
}

const order = (page: Page) =>
  page
    .locator(ROW)
    .evaluateAll((rows) =>
      rows
        .map((row) => row.getAttribute('data-services-row'))
        .filter((href): href is string => href !== null)
    );

const storedOrder = (page: Page) =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'), ORDER_KEY);

/** Centre of a row's grip, and the height one slot of travel is worth. */
async function gripAt(page: Page, index: number) {
  const row = page.locator(ROW).nth(index);
  const grip = row.getByRole('button');
  const box = await grip.boundingBox();
  const rowBox = await row.boundingBox();
  if (!box || !rowBox) throw new Error(`row ${index} has no box to grab`);

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    slot: rowBox.height,
  };
}

test.describe('خدماتنا order', () => {
  test('a dragged row keeps its slot and the device remembers it', async ({ page }) => {
    const dialog = await openMenu(page);

    const before = await order(page);
    expect(before[0]).toBe('/request-project');

    const grab = await gripAt(page, 0);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    // Two slots down, in small steps so the frame loop sees every crossing.
    await page.mouse.move(grab.x, grab.y + grab.slot * 2, { steps: 20 });
    await page.mouse.up();

    const after = await order(page);
    expect(after.slice(0, 3)).toEqual([before[1], before[2], before[0]]);
    expect(await storedOrder(page)).toEqual(after);

    // Reopening — and reloading — reads the remembered order back.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await openMenu(page);
    expect(await order(page)).toEqual(after);
  });

  test('the grip takes the arrow keys', async ({ page }) => {
    const dialog = await openMenu(page);
    const before = await order(page);

    const first = dialog.locator(ROW).nth(0);
    await first.getByRole('button').focus();
    await page.keyboard.press('ArrowDown');

    expect((await order(page)).slice(0, 2)).toEqual([before[1], before[0]]);
    await expect(dialog.getByRole('status')).toContainText('الموضع 2');

    // End sends the focused row to the bottom.
    await page.keyboard.press('End');
    const after = await order(page);
    expect(after.at(-1)).toBe(before[0]);
    expect(await storedOrder(page)).toEqual(after);
  });

  test('a tap on a row still follows its link', async ({ page }) => {
    const dialog = await openMenu(page);

    await dialog.getByRole('menuitem', { name: 'القرآن الكريم' }).click();

    await expect(page).toHaveURL(/\/quran/);
    await expect(dialog).toBeHidden();
  });

  /**
   * A row's click closes the sheet *and* navigates, and the close takes the
   * sheet's history entry back off. Done in that order the pop used to land on
   * the router's uncommitted push and cancel it; done in the wrong order (push
   * first) the entry would strand itself behind the new page and Back would step
   * onto a copy of the page it came from. Both are the same check: one row click,
   * one forward move, one way back.
   */
  test('a row click leaves no history entry behind', async ({ page }) => {
    const dialog = await openMenu(page);

    await dialog.getByRole('menuitem', { name: 'القرآن الكريم' }).click();
    await expect(page).toHaveURL(/\/quran/);

    await page.goBack();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/$/);
  });
});
