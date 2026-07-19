import { test } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL!;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!;

test('debug: session on homepage vs spendtrack', async ({ page }) => {
  await page.goto('/auth/login', { waitUntil: 'networkidle', timeout: 60_000 });

  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), {
    timeout: 30_000,
  });

  await page.waitForLoadState('networkidle', { timeout: 30_000 });

  // Wait for session to be resolved
  await page.waitForFunction(
    () => {
      // Check if either login or logout button exists
      const allBtns = document.querySelectorAll('button');
      for (const b of allBtns) {
        if (b.textContent?.includes('تسجيل الخُروج') || b.textContent?.includes('تسجيل الدُّخول'))
          return true;
      }
      return false;
    },
    { timeout: 30_000 }
  );

  // On homepage - check state
  const homepageState = await page.evaluate(async () => {
    // Directly read document.cookie
    const cookieString = document.cookie;
    const cookieNames = cookieString.split(';').map((c) => c.trim().split('=')[0]);

    // Try to manually decode the session
    const authKey = cookieNames.find((k) => k?.includes('auth-token'));
    const authChunks = cookieNames.filter((k) => k?.includes('auth-token.'));

    // Now try to instantiate supabase client and get session
    const { createBrowserClient } = await import('@supabase/ssr');
    const client = createBrowserClient(
      'https://ievboaylytxgtijconak.supabase.co',
      'sb_publishable_S6OJdmRtfmL_trKAY1ypqQ_WZYRjVK2'
    );
    const { data, error } = await client.auth.getSession();

    return {
      url: window.location.href,
      authKey,
      authChunks,
      sessionFound: !!data.session,
      userId: data.session?.user?.id,
      error: error?.message,
      cookieLength: cookieString.length,
    };
  });

  console.log('=== HOMEPAGE STATE ===');
  console.log(JSON.stringify(homepageState, null, 2));

  // Now navigate to /spendtrack
  await page.goto('/spendtrack', { waitUntil: 'networkidle', timeout: 60_000 });

  // Wait for session to be resolved
  await page.waitForFunction(
    () => {
      const allBtns = document.querySelectorAll('button');
      for (const b of allBtns) {
        if (b.textContent?.includes('تسجيل الخُروج') || b.textContent?.includes('تسجيل الدُّخول'))
          return true;
      }
      return false;
    },
    { timeout: 30_000 }
  );

  const spendtrackState = await page.evaluate(async () => {
    const cookieString = document.cookie;
    const cookieNames = cookieString.split(';').map((c) => c.trim().split('=')[0]);

    const authKey = cookieNames.find((k) => k?.includes('auth-token'));
    const authChunks = cookieNames.filter((k) => k?.includes('auth-token.'));

    const { createBrowserClient } = await import('@supabase/ssr');
    const client = createBrowserClient(
      'https://ievboaylytxgtijconak.supabase.co',
      'sb_publishable_S6OJdmRtfmL_trKAY1ypqQ_WZYRjVK2'
    );
    const { data, error } = await client.auth.getSession();

    return {
      url: window.location.href,
      authKey,
      authChunks,
      sessionFound: !!data.session,
      userId: data.session?.user?.id,
      error: error?.message,
      cookieLength: cookieString.length,
    };
  });

  console.log('=== SPENDTRACK STATE ===');
  console.log(JSON.stringify(spendtrackState, null, 2));
});
