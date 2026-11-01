import { test, expect, type Locator } from '@playwright/test';

/**
 * The phone composer's contract with the on-screen keyboard (ADR-0109).
 *
 * Playwright cannot raise a real keyboard, but `interactive-widget:
 * resizes-content` means the keyboard *is* a shorter layout viewport for
 * everything the page can see — so shrinking the window is the same event the
 * dialog answers, and the assertions below are the fix: the footer and the
 * reading line stand down, the text and its tools reach the bottom of the
 * screen, and the field takes the height they were holding.
 */

const PHONE = { width: 390, height: 780 };
const WITH_KEYBOARD = { width: 390, height: 500 };

async function box(locator: Locator) {
  const measured = await locator.boundingBox();
  if (!measured) throw new Error('nothing to measure');
  return measured;
}

test('a phone composer gives the keyboard the screen', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/notes');
  await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

  // Dispatched rather than clicked: in `next dev` the framework's own indicator
  // sits in the same corner and intercepts the pointer.
  await page.locator('#btn-new-note').dispatchEvent('click');

  // Each dialog is scoped by the field it holds: a dialog on its way out stays in
  // the DOM for its exit animation, and an unscoped slot locator matches both.
  const composer = page.locator('[data-slot="dialog-content"]:has(#composer-note-body)');
  const composerFooter = composer.locator('[data-slot="dialog-actions"]');
  const surface = composer.locator('#composer-note-body');
  const toolbar = composer.getByRole('toolbar', { name: 'تنسيق النَّصّ' });

  await expect(composerFooter).toBeVisible();
  await expect(surface).toBeVisible();

  // The tools sit under the text on a phone, not above it.
  expect((await box(toolbar)).y).toBeGreaterThan((await box(surface)).y);

  // The keyboard arrives as a shorter layout viewport.
  await page.setViewportSize(WITH_KEYBOARD);

  await expect(page.locator('html')).toHaveAttribute('data-keyboard', 'open');
  await expect(composerFooter).toBeHidden();

  // Nothing sits between the note and the keyboard: the row of tools ends where
  // the dialog's own padding does.
  const composerBox = await box(composer);
  const typingToolbar = await box(toolbar);
  expect(
    composerBox.y + composerBox.height - (typingToolbar.y + typingToolbar.height)
  ).toBeLessThan(40);

  // And the field is taller for it. The comparison is the same viewport with the
  // footer handed back — the attribute is the only switch — so what the text
  // gains is measured rather than assumed.
  const withKeyboard = await box(surface);
  await page.evaluate(() => document.documentElement.removeAttribute('data-keyboard'));
  await expect(composerFooter).toBeVisible();
  expect((await box(surface)).height).toBeLessThan(withKeyboard.height - 60);

  // The keyboard's dismissal puts the footer back.
  await page.setViewportSize(PHONE);
  await expect(composerFooter).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-keyboard', 'open');

  // The note the composer creates opens in the editor, which carries the reading
  // line under the field: it stands down for the keyboard too.
  await surface.click();
  await page.keyboard.type('ملاحظة عن لوحة المفاتيح');
  await page.getByRole('button', { name: 'إنشاء الملاحظة' }).click();

  const editor = page.locator('[data-slot="dialog-content"]:has(#note-body)');
  const editorFooter = editor.locator('[data-slot="dialog-actions"]');
  const reading = editor.locator('[data-slot="composer-meta"]');

  await expect(editor.locator('#note-body')).toContainText('ملاحظة عن لوحة المفاتيح');
  await expect(reading).toBeVisible();

  await page.setViewportSize(WITH_KEYBOARD);
  await expect(reading).toBeHidden();
  await expect(editorFooter).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-keyboard', 'open');

  await page.setViewportSize(PHONE);
  await expect(reading).toBeVisible();
  await expect(editorFooter).toBeVisible();
});
