import { test, expect } from '@playwright/test';

/**
 * A guest smoke test for Notes: no account, no network beyond the document.
 * Proves the two things the unit tests cannot — the editor chunk mounts and the
 * debounced autosave reaches the Local Store — and that the list, search and
 * undo read it back.
 */

test('a guest writes, searches, reloads and undoes a note', async ({ page }) => {
  await page.goto('/notes');
  await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

  // The FAB opens the composer, and the note it creates opens in the editor.
  // Dispatched rather than clicked: in `next dev` the framework's own indicator
  // sits in the same corner and intercepts the pointer.
  await page.locator('#btn-new-note').dispatchEvent('click');
  await expect(page.locator('#composer-note-body')).toBeVisible();
  await page.locator('#composer-note-body').click();

  // A note is its body (ADR-0110): the first line is the name the list shows,
  // so it is the line this test searches and deletes by.
  await page.keyboard.type('ملاحظة اختبار');
  await page.keyboard.press('Enter');
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
