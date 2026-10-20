import { test, expect } from '@playwright/test';
import { signIn } from './sign-in';

/**
 * The real-server half of the sync chaos suite (#388): a create is delivered,
 * its acknowledgement is lost, and the Outbox replays it — with the endpoint's
 * client-id upsert making the second delivery the same row, not a duplicate
 * (ADR-0029, ADR-0033).
 *
 * The unit chaos suite (`frontend/shared/local-store/__tests__/sync-chaos.test.ts`)
 * proves the engine keeps and replays the intent. This proves the product's
 * write path converges when it does, which is the question the issue leaves to
 * the endpoint.
 *
 * Route interception cannot see requests a service worker forwards, so the
 * worker is blocked. Offline is still real: the page loads online, the radio is
 * cut after it is running, and nothing reloads while it is off.
 *
 * Gated behind SYNC_CHAOS_E2E=1 because it needs a live Supabase project plus
 * the E2E test user:
 *   Run: SYNC_CHAOS_E2E=1 npx playwright test e2e/sync-chaos.spec.ts
 */

const ENABLED = process.env.SYNC_CHAOS_E2E === '1';

test.skip(!ENABLED, 'requires SYNC_CHAOS_E2E=1 (live Supabase + auth)');

test('a create whose acknowledgement was lost replays without duplicating the row', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'block' });
  await signIn(context, baseURL!);

  const serverHabits = async (): Promise<Array<{ id: string; name: string }>> => {
    const response = await context.request.fetch(`${baseURL}/habitflow/api/habits`);
    if (!response.ok()) return [];
    const body = (await response.json()) as { habits?: Array<{ id: string; name: string }> };
    return body.habits ?? [];
  };

  const name = `Chaos-${Date.now()}`;
  let posts = 0;

  await context.route('**/habitflow/api/habits*', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();

    posts += 1;
    if (posts === 1) {
      // Deliver the write, then lose the response. The server has the row and
      // the page is told the network dropped, so the intent stays in the Outbox.
      await route.fetch();
      await route.abort('failed');
      return;
    }

    await route.continue();
  });

  const page = await context.newPage();
  await page.goto(`${baseURL}/habitflow`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#btn-create-habit')).toBeVisible();

  // Radio off: the write lands in the Local Store and stays in the Outbox.
  await context.setOffline(true);
  await page.locator('#btn-create-habit').click();
  await page.locator('#input-add-habit-name').fill(name);
  await page.locator('#btn-submit-add-habit').click();
  await expect(page.getByText(name)).toBeVisible();

  // Reconnect: the page flushes, the server accepts, and the ack is lost.
  await context.setOffline(false);
  await expect.poll(() => posts, { timeout: 30_000 }).toBe(1);
  await expect
    .poll(async () => (await serverHabits()).map((habit) => habit.name), { timeout: 30_000 })
    .toContain(name);

  // The engine backed the intent off; let that lapse, then run the next flush
  // trigger the page already owns (focus).
  await page.waitForTimeout(2_500);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect.poll(() => posts, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);

  // The replay delivered the same client id, so the server still has one row.
  await expect
    .poll(async () => (await serverHabits()).filter((habit) => habit.name === name).length, {
      timeout: 30_000,
    })
    .toBe(1);

  // Clean up so the suite is idempotent.
  const created = (await serverHabits()).find((habit) => habit.name === name);
  if (created) {
    await context.request.fetch(
      `${baseURL}/habitflow/api/habits?id=${encodeURIComponent(created.id)}`,
      { method: 'DELETE' }
    );
  }

  await context.close();
});
