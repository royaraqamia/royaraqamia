import { test, expect } from '@playwright/test';
/**
 * Offline queueing for the lead forms (#169): a Project Request submitted with
 * the network off is queued in the Outbox, replayed on reconnection, and the
 * visitor then sees the Reference Code. Consultation Booking, which reserves an
 * Availability Slot, must instead show a needs-connection state and never queue.
 *
 * Exercises the real service worker and the real endpoints. Gated behind
 * LEAD_OFFLINE_E2E=1 because it needs a live server (and a reachable Supabase
 * project for the request write):
 *   Run: LEAD_OFFLINE_E2E=1 npx playwright test e2e/lead-offline.spec.ts
 */

const ENABLED = process.env.LEAD_OFFLINE_E2E === '1';

test.skip(!ENABLED, 'requires LEAD_OFFLINE_E2E=1 (live server)');

const REFERENCE_CODE = /PRJ-\d{4}-[A-Z0-9]{8}/;

test('an offline project request reaches the server after reconnect', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  // Pin the default dial country so the phone field composes deterministically.
  await context.addCookies([{ name: 'rr-country', value: 'SY', url: baseURL! }]);

  const page = await context.newPage();
  await page.goto(`${baseURL}/request-project`, { waitUntil: 'domcontentloaded' });

  // Reload once online so the service worker takes control and caches the chunks
  // the (offline) wizard needs.
  await page.reload({ waitUntil: 'domcontentloaded' });

  await context.setOffline(true);

  await page.getByRole('radio', { name: /موقع/ }).click();
  await page.getByRole('button', { name: /التَّالي/ }).click();

  await page.locator('#description').fill('مشروع تجريبي لاختبار الإرسال دون اتصال بالشبكة.');
  await page.getByRole('button', { name: /التَّالي/ }).click();

  await page.locator('#full_name').fill('أحمد العلي');
  await page.locator('#phone_whatsapp').fill('968478904');
  await page.getByRole('button', { name: /أرسِل طلب المشروع/ }).click();

  // The submission is durable locally and shown as queued, not as a Reference Code.
  await expect(page.getByText('حُفِظ طلبك على هذا الجهاز')).toBeVisible();

  // Radio back on: the `online` trigger flushes the Outbox and the code arrives.
  await context.setOffline(false);

  await expect(page.getByText(REFERENCE_CODE)).toBeVisible({ timeout: 30_000 });

  await context.close();
});

test('consultation booking says it needs a connection offline and never queues', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  await page.goto(`${baseURL}/consultation/book`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /التَّالي/ })).toBeVisible();

  await context.setOffline(true);

  await expect(page.getByText('الحجز يحتاج اتصالًا بالإنترنت لتأكيد الموعد المتاح')).toBeVisible();

  await context.close();
});
