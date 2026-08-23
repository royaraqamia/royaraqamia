import { test, expect } from '@playwright/test';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
/**
 * Live end-to-end verification of the native Web Push pipeline: real
 * subscription through the app's own client code, real VAPID push accepted
 * by the push service, and proof that the service worker received the event
 * and displayed the notification.
 *
 * Gated behind PUSH_E2E=1 because it needs:
 *   - a headed browser (headless Chromium denies notification permission on
 *     Windows — the OS notification platform is unavailable),
 *   - outbound access to the Google/Windows push services,
 *   - VAPID + service-role secrets in .env.
 * Run: PUSH_E2E=1 npx playwright test e2e/push.spec.ts
 */

const ENABLED = process.env.PUSH_E2E === '1';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;

test.skip(!ENABLED, 'requires PUSH_E2E=1 (headed browser, push-service network access)');

test.use({ headless: false });

test('native web push round-trip', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const context = await browser.newContext({
    permissions: ['notifications'],
    viewport: { width: 1280, height: 800 },
  });

  // Authenticate through the same API the login form posts to.
  const loginRes = await context.request.fetch(`${baseURL}/auth/api/login`, {
    method: 'POST',
    data: { email: EMAIL, password: PASSWORD, redirectTo: null, turnstileToken: '' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(loginRes.ok()).toBeTruthy();

  const page = await context.newPage();
  await page.goto(baseURL!, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.some((r) => r.active);
    },
    null,
    { timeout: 45_000 }
  );
  await page.waitForLoadState('load');
  await page.waitForTimeout(2500); // hydration + client auto-heal

  expect(await page.evaluate(() => Notification.permission)).toBe('granted');

  const getSub = () =>
    page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      const reg = regs.find((r) => r.active);
      const sub = reg && (await reg.pushManager.getSubscription());
      return sub ? sub.toJSON() : null;
    });

  // Auto-heal subscribes when permission is granted; fall back to the toggle.
  let subJson = await getSub();
  if (!subJson) {
    await page.locator('button[aria-label^="الإشعارات"]').first().click();
    const enableBtn = page.getByRole('button', { name: 'تفعيل إشعارات الجهاز' });
    await enableBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await enableBtn.click();
    for (let i = 0; i < 20 && !subJson; i += 1) {
      await page.waitForTimeout(1000);
      subJson = await getSub();
      if (!subJson && i === 9 && (await enableBtn.isVisible().catch(() => false))) {
        await enableBtn.click().catch(() => {});
      }
    }
  }
  expect(subJson?.endpoint).toBeTruthy();
  if (!subJson?.endpoint || !subJson.keys?.p256dh || !subJson.keys.auth) {
    throw new Error('subscription missing endpoint/keys');
  }
  const { endpoint, keys } = subJson as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  const { error: dbErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .eq('endpoint', endpoint)
    .single();
  expect(dbErr).toBeNull();

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  const title = 'إشعار اختبار E2E';
  const swLogs: string[] = [];
  context.on('serviceworker', (sw) => void sw.on('console', (m) => void swLogs.push(m.text())));

  await webpush.sendNotification(
    { endpoint, keys },
    JSON.stringify({
      title,
      body: 'تحقق شامل من خط الإشعارات',
      url: '/',
      notificationId: `e2e-${Date.now()}`,
    }),
    { TTL: 120, urgency: 'high' }
  );

  // On Windows the toast is handed to the OS Action Center, so
  // registration.getNotifications() reads empty — assert on SW telemetry.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !swLogs.some((t) => t.includes(title))) {
    await page.waitForTimeout(1000);
  }
  expect(swLogs.join('\n')).toContain(title);
  expect(swLogs.join('\n')).toContain('[sw] showNotification OK');

  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  await context.close();
});
