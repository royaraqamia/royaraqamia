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
  title: string;
}

test('an offline note reaches the server after reconnect', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  await signIn(context, baseURL!);

  const title = `E2E-${Date.now()}`;
  const page = await context.newPage();
  await gotoUnderWorkerControl(page, `${baseURL}/notes`);
  await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

  // Warm the editor chunk while still online.
  await page.locator('#btn-new-note').click();
  await expect(page.locator('#note-title')).toBeVisible();

  // Radio off: the write must land in the Local Store and render from there.
  await context.setOffline(true);
  await page.locator('#note-title').fill(title);
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('سطر كُتب بلا اتِّصال.');
  await expect(page.getByRole('heading', { name: 'المُلاحظات' })).toBeVisible();

  // Radio back on: the `online` trigger flushes the Outbox.
  await context.setOffline(false);

  await expect
    .poll(
      async () => {
        const res = await context.request.fetch(`${baseURL}/notes/api/sync`);
        if (!res.ok()) return [];
        const body = (await res.json()) as { notes?: SyncedNote[] };
        return (body.notes ?? []).map((note) => note.title);
      },
      { timeout: 30_000 }
    )
    .toContain(title);

  // Clean up so the suite is idempotent.
  const res = await context.request.fetch(`${baseURL}/notes/api/sync`);
  const body = (await res.json()) as { notes?: SyncedNote[] };
  const created = (body.notes ?? []).find((note) => note.title === title);
  if (created) {
    await context.request.fetch(`${baseURL}/notes/api/notes/${created.id}`, {
      method: 'DELETE',
      data: {},
    });
  }

  await context.close();
});
