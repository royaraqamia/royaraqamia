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

  await page.locator('#btn-new-note').click();
  await expect(page.locator('#note-title')).toBeVisible();
  await page.locator('#note-title').fill('ملاحظة اختبار');
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('محتوى يُحفظ تلقائيًّا.');

  // The debounce writes to the store; the list row is the store's own read.
  await expect(page.getByRole('button', { name: /ملاحظة اختبار/ }).first()).toBeVisible({
    timeout: 10_000,
  });

  // A reload paints the same note, with the body still in the editor.
  await page.reload();
  await expect(page.locator('#note-title')).toHaveValue('ملاحظة اختبار', { timeout: 10_000 });
  await expect(page.locator('.ProseMirror')).toContainText('محتوى يُحفظ تلقائيًّا.');

  // Search filters the list, and a miss says so.
  await page.getByRole('searchbox', { name: 'ابحث في الملاحظات' }).fill('اختبار');
  await expect(page.getByRole('button', { name: /ملاحظة اختبار/ }).first()).toBeVisible();
  await page.getByRole('searchbox', { name: 'ابحث في الملاحظات' }).fill('لا يوجد');
  await expect(page.getByText('لا نتائج للبحث')).toBeVisible();

  // Delete offers the undo, and the undo brings the same note back.
  await page.getByRole('button', { name: 'مسح البحث' }).click();
  await page.getByRole('button', { name: 'حذف الملاحظة' }).click();
  await expect(page.getByText('لا ملاحظات بعد')).toBeVisible();
  await page.getByRole('button', { name: 'تراجع' }).click();
  await expect(page.locator('#note-title')).toHaveValue('ملاحظة اختبار');
});
