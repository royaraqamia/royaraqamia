import { test, expect } from '@playwright/test';

/**
 * A guest smoke test for Notes: no account, no network beyond the document.
 * Proves the two things the unit tests cannot — the editor chunk mounts and the
 * debounced autosave reaches the Local Store — and that the list, search and
 * undo read it back.
 */

test('a guest writes, searches, reloads and undoes a note', async ({ page }) => {
  // The notes list is a tab of the door (ADR-0168), so the address is the door's
  // own; the surface under the strip is the same component the route draws.
  await page.goto('/?tab=/notes');
  await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

  // The FAB opens the composer, and the note it creates opens in the editor.
  // Dispatched rather than clicked: in `next dev` the framework's own indicator
  // sits in the same corner and intercepts the pointer.
  await page.locator('#btn-new-note').dispatchEvent('click');
  await expect(page.locator('#composer-note-body')).toBeVisible();

  // The empty surface says what it is for. Tiptap only decorates the block with
  // `data-placeholder` and leaves the words to the stylesheet, so the assertion
  // is the painted `::before` — the attribute alone renders nothing.
  const hint = await page.evaluate(() => {
    const block = document.querySelector('#composer-note-body [data-placeholder]');
    return block ? getComputedStyle(block, '::before').content : null;
  });
  expect(hint).toContain('اكتب ملاحظتك هنا…');

  await page.locator('#composer-note-body').click();

  // A note is its body (ADR-0110): the first line is the name the list shows,
  // so it is the line this test searches and deletes by.
  await page.keyboard.type('ملاحظة اختبار');
  await expect(page.locator('#composer-note-body [data-placeholder]')).toHaveCount(0);

  // Enter is a paragraph, and the hint belongs to an empty document (ADR-0191).
  // The empty second line used to paint the hint again — a composer that looked
  // like two fields — and prose's paragraph margins turned each Enter into a
  // block-sized gap. Both are measured on the real surface.
  await page.keyboard.press('Enter');
  const afterEnter = await page.evaluate(() => {
    const surface = document.querySelector('#composer-note-body');
    if (!surface) throw new Error('no composer surface');
    const painted = Array.from(surface.querySelectorAll('[data-placeholder]')).filter(
      (block) => getComputedStyle(block, '::before').content !== 'none'
    ).length;
    const paragraphs = Array.from(surface.querySelectorAll('p')) as HTMLElement[];
    const first = paragraphs[0];
    const second = paragraphs[1];
    if (!first || !second) throw new Error('the composer did not split into two paragraphs');
    const lineHeight = parseFloat(getComputedStyle(first).lineHeight);
    return {
      painted,
      gap: second.getBoundingClientRect().top - first.getBoundingClientRect().bottom,
      lineHeight,
    };
  });
  expect(afterEnter.painted).toBe(0);
  expect(afterEnter.gap).toBeLessThan(afterEnter.lineHeight);

  await page.keyboard.type('محتوى يُحفظ تلقائيًّا.');
  await page.getByRole('button', { name: 'إنشاء الملاحظة' }).click();
  await expect(page.locator('#note-body')).toContainText('محتوى يُحفظ تلقائيًّا.');

  // A reload paints the same note, with the body still in the editor.
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.locator('#note-body')).toContainText('محتوى يُحفظ تلقائيًّا.', {
    timeout: 10_000,
  });

  // The list row is the store's own read, named by the note's first line.
  await page.getByRole('button', { name: 'تمّ' }).click();
  await expect(page.getByRole('button', { name: /ملاحظة اختبار/ }).first()).toBeVisible({
    timeout: 10_000,
  });

  // Search filters the list, and a miss says so.
  await page.getByRole('textbox', { name: 'ابحث في الملاحظات' }).fill('اختبار');
  await expect(page.getByRole('button', { name: /ملاحظة اختبار/ }).first()).toBeVisible();
  await page.getByRole('textbox', { name: 'ابحث في الملاحظات' }).fill('لا يوجد');
  await expect(page.getByText('لا نتائج للبحث')).toBeVisible();

  // Delete asks first, then offers the undo, and the undo brings the note back.
  await page.getByRole('button', { name: 'إلغاء البحث' }).click();
  await page
    .getByRole('button', { name: /ملاحظة اختبار/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'إجراءات الملاحظة' }).click();
  await page.getByRole('menuitem', { name: 'حذف' }).click();
  await expect(page.getByRole('heading', { name: 'حذف الملاحظة؟' })).toBeVisible();
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.getByText('لا ملاحظات بعد')).toBeVisible();

  // The row stays put while the note is a tombstone, and the undo revives it.
  await page.getByRole('button', { name: 'تراجع' }).click();
  await expect(page.locator('#note-body')).toContainText('محتوى يُحفظ تلقائيًّا.');
});

/**
 * The phone is the surface where the defect was visible: the toolbar is painted
 * under the text but emitted before it, so the old dialog opened on the first
 * tool and the first keystrokes went nowhere (#1695). These cases assert the
 * opening focus and the toolbar's single tab stop on that exact viewport.
 */
test.describe('notes editor focus on a phone', () => {
  test.use({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    locale: 'ar',
    timezoneId: 'Asia/Riyadh',
  });

  test('the composer opens on the text, so typing needs no click', async ({ page }) => {
    await page.goto('/?tab=/notes');
    await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

    await page.locator('#btn-new-note').dispatchEvent('click');
    await expect(page.locator('#composer-note-body')).toBeVisible();
    await expect(page.locator('#composer-note-body')).toBeFocused();

    await page.keyboard.type('اختبار');
    await expect(page.locator('#composer-note-body')).toContainText('اختبار');
  });

  test('an opened note takes focus too', async ({ page }) => {
    await page.goto('/?tab=/notes');
    await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

    await page.locator('#btn-new-note').dispatchEvent('click');
    await expect(page.locator('#composer-note-body')).toBeFocused();
    await page.keyboard.type('اختبار');
    await page.getByRole('button', { name: 'إنشاء الملاحظة' }).click();

    await expect(page.locator('#note-body')).toContainText('اختبار');
    await expect(page.locator('#note-body')).toBeFocused();
    await page.keyboard.type(' مضافة');
    await expect(page.locator('#note-body')).toContainText('اختبار مضافة');
  });

  test('the toolbar is one tab stop and Arrow keys move between tools', async ({ page }) => {
    await page.goto('/?tab=/notes');
    await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

    await page.locator('#btn-new-note').dispatchEvent('click');
    await expect(page.locator('#composer-note-body')).toBeFocused();

    const toolbar = page.getByRole('toolbar', { name: 'تنسيق النَّصّ' });
    expect(await toolbar.locator('button[tabindex="0"]').count()).toBe(1);

    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'عريض' })).toBeFocused();
    // The surface is RTL, so Left walks forward through the row.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: 'مائل' })).toBeFocused();
    expect(await toolbar.locator('button[tabindex="0"]').count()).toBe(1);
  });
});
