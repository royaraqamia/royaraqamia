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
  await expect(page.locator('#composer-note-title')).toBeVisible();
  await page.locator('#composer-note-title').fill('ملاحظة اختبار');
  await page.locator('#composer-note-body').click();
  await page.keyboard.type('محتوى يُحفظ تلقائيًّا.');
  await page.getByRole('button', { name: 'إنشاء الملاحظة' }).click();
  await expect(page.locator('#note-title')).toHaveValue('ملاحظة اختبار');

  // A reload paints the same note, with the body still in the editor.
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.locator('#note-title')).toHaveValue('ملاحظة اختبار', { timeout: 10_000 });
  await expect(page.locator('.ProseMirror')).toContainText('محتوى يُحفظ تلقائيًّا.');

  // The debounce wrote to the store; the list row is the store's own read.
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
  await page.getByRole('button', { name: 'حذف الملاحظة' }).click();
  await expect(page.getByRole('heading', { name: 'حذف الملاحظة؟' })).toBeVisible();
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.getByText('لا ملاحظات بعد')).toBeVisible();
  await page.getByRole('button', { name: 'تراجع' }).click();
  await expect(page.locator('#note-title')).toHaveValue('ملاحظة اختبار');
});
