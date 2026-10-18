import { test, expect, type BrowserContext } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';
/**
 * Offline drafts for BlogPress (#168): a draft body renders and edits from the
 * Local Store with the radio off, the edit queues in the Outbox, and it replays
 * to the server on reconnect. Publishing is online-gated. Exercises the real
 * service worker, the real endpoints and a real authenticated session.
 *
 * Gated behind BLOGPRESS_OFFLINE_E2E=1 because it needs a live Supabase project
 * plus the E2E test user:
 *   Run: BLOGPRESS_OFFLINE_E2E=1 npx playwright test e2e/blogpress-offline.spec.ts
 */

const ENABLED = process.env.BLOGPRESS_OFFLINE_E2E === '1';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;

test.skip(!ENABLED, 'requires BLOGPRESS_OFFLINE_E2E=1 (live Supabase + auth)');

async function login(context: BrowserContext, baseURL: string) {
  const res = await context.request.fetch(`${baseURL}/auth/api/login`, {
    method: 'POST',
    data: {
      email: EMAIL,
      password: PASSWORD,
      redirectTo: null,
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
}

/** Creates a draft through the real API and returns its id. */
async function createDraft(context: BrowserContext, baseURL: string): Promise<string> {
  const res = await context.request.fetch(`${baseURL}/api/blogpress/posts`, { method: 'POST' });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { id: string };
  return body.id;
}

test('an offline draft edit reaches the server after reconnect', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  await login(context, baseURL!);
  const id = await createDraft(context, baseURL!);
  const body = `E2E offline draft ${Date.now()}`;

  const page = await context.newPage();
  // Open online so the app chunks and the seed are cached for the offline pass.
  await gotoUnderWorkerControl(page, `${baseURL}/blogpress/editor/${id}`);
  await page.locator('[data-blogpress-ready="true"]').waitFor();

  // Publish is online-gated: with the radio off it shows a needs-connection state.
  await context.setOffline(true);
  await expect(page.getByText('النَّشر يتطلَّب اتصالاً')).toBeVisible();

  // Offline write: the edit lands in the Local Store and renders from it.
  await page.locator('.ProseMirror').click();
  await page.keyboard.type(body);
  await expect(page.locator('.ProseMirror')).toContainText(body);

  // Give the 1.2s autosave debounce time to queue the Outbox intent.
  await page.waitForTimeout(2000);

  // Radio back on: the `online` trigger flushes the Outbox, and the replayed
  // edit is a PATCH to the post. Asserting the replay is the only honest proof
  // that the edit reached the server: the editor paints its body from the Local
  // Store, so a reload shows the edit whether or not the server ever got it.
  // (This spec used to reload the editor in a loop and read it back. That is
  // doubly unsound — the read proves nothing — and it also failed hard: the
  // predicate's `waitFor` has no budget of its own, so the first reload the
  // worker could not serve burned the whole poll timeout on the offline
  // fallback page, which has no `data-blogpress-ready` marker.)
  const replay = page.waitForResponse(
    (res) => res.url().includes(`/api/blogpress/posts/${id}`) && res.request().method() === 'PATCH',
    { timeout: 60_000 }
  );
  await context.setOffline(false);
  const response = await replay;
  expect(response.ok()).toBeTruthy();
  const replayed = JSON.parse(response.request().postData() ?? '{}') as { content?: string };
  expect(replayed.content).toContain(body);

  // Clean up so the suite stays idempotent.
  await context.request.fetch(`${baseURL}/api/blogpress/posts/${id}`, { method: 'DELETE' });
  await context.close();
});
