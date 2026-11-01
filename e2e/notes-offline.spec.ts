import { test, expect } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';
import { signIn } from './sign-in';

/**
 * Offline read/write/resume for Notes (ADR-0092): a note created with the
 * network off lands in the Local Store, paints from there, and its Outbox
 * intents replay once the connection returns. Exercises the real service
 * worker, the real endpoints and a real authenticated session.
 *
 * Gated behind NOTES_OFFLINE_E2E=1 because it needs a live Supabase project plus
 * the E2E test user:
 *   Run: NOTES_OFFLINE_E2E=1 npx playwright test e2e/notes-offline.spec.ts
 */

const ENABLED = process.env.NOTES_OFFLINE_E2E === '1';

test.skip(!ENABLED, 'requires NOTES_OFFLINE_E2E=1 (live Supabase + auth)');

interface SyncedNote {
  id: string;
  body: string;
}

test('an offline note reaches the server after reconnect', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  await signIn(context, baseURL!);

  // A note is its body (ADR-0110): the name the list shows is its first line,
  // so the marker the sync is polled for is written as that line.
  const marker = `E2E-${Date.now()}`;
  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/notes`);
  await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

  // Warm the editor chunk while still online: the FAB's composer creates the
  // note, and the note it creates opens in the editor.
  await page.locator('#btn-new-note').dispatchEvent('click');
  await page.locator('#composer-note-body').click();
  await page.keyboard.type(marker);
  await page.getByRole('button', { name: 'إنشاء الملاحظة' }).click();
  await expect(page.locator('#note-body')).toContainText(marker);

  // Radio off: the write must land in the Local Store and render from there.
  await context.setOffline(true);
  await page.locator('#note-body').click();
  await page.keyboard.type('سطر كُتب بلا اتِّصال.');
  await expect(page.locator('#note-body')).toBeVisible();

  // Radio back on: the `online` trigger flushes the Outbox.
  await context.setOffline(false);

  const syncedBodies = async (): Promise<string> => {
    const response = await context.request.fetch(`${baseURL}/notes/api/sync`);
    if (!response.ok()) return '';
    const payload = (await response.json()) as { notes?: SyncedNote[] };
    return (payload.notes ?? []).map((note) => note.body).join('\n');
  };

  // Both writes reach the server: the create made before the radio went off, and
  // the line typed while it was.
  await expect.poll(syncedBodies, { timeout: 30_000 }).toContain(marker);
  await expect.poll(syncedBodies, { timeout: 30_000 }).toContain('بلا اتِّصال');

  // Clean up so the suite is idempotent.
  const res = await context.request.fetch(`${baseURL}/notes/api/sync`);
  const body = (await res.json()) as { notes?: SyncedNote[] };
  const created = (body.notes ?? []).find((note) => note.body.includes(marker));
  if (created) {
    await context.request.fetch(`${baseURL}/notes/api/notes/${created.id}`, {
      method: 'DELETE',
      data: {},
    });
  }

  await context.close();
});
