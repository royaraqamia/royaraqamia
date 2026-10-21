import { test, expect } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';

/**
 * Public-content offline read (#170): a previously visited public route paints
 * from the service-worker cache with the network off, the offline indicator
 * reports how old that cached copy is, and Rates keeps its live-fed snapshot
 * read-only with refresh disabled.
 *
 * Exercises the real service worker and the real app. Gated behind
 * PUBLIC_OFFLINE_E2E=1 because the worker is only registered outside
 * development (`PWAProvider`) and dev responses are not cacheable, so this must
 * run against a production build:
 *   npm run build && npm run start
 *   PUBLIC_OFFLINE_E2E=1 npx playwright test e2e/public-offline.spec.ts
 */

const ENABLED = process.env.PUBLIC_OFFLINE_E2E === '1';

test.skip(!ENABLED, 'requires PUBLIC_OFFLINE_E2E=1 (production build)');

test('a visited public page paints from cache offline and shows its age', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // The auth shells ride the SWR cache since #447, and the login document must
  // be visited once online before it can be reloaded offline: the visit caches
  // the runtime shell together with the chunk graph hydration needs.
  await gotoUnderWorkerControl(page, `${baseURL}/auth/login`);
  await expect(page.getByRole('heading', { name: 'تسجيل الدُّخول' })).toBeVisible();

  // First load registers the worker and the app replaces the document when it
  // claims the page; the helper returns with that reload already applied.
  await gotoUnderWorkerControl(page, `${baseURL}/rates`);
  await expect(page.getByRole('heading', { name: /أسعار الصَّرف/ })).toBeVisible();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /أسعار الصَّرف/ })).toBeVisible();

  const offlineIndicator = page.getByRole('status').filter({ hasText: 'غير متَّصل' });
  await expect(offlineIndicator).toBeVisible();
  await expect(offlineIndicator).toContainText('نسخة محفوظة');

  // Rates are a live-fed snapshot (ADR-0031): the board is read-only offline, and
  // nothing offers to refresh it. The page renders no refresh control at all — by
  // design, not by omission: refreshing is server-owned (the cron route plus
  // refresh-on-read), so what is held here is the absence of the affordance, not a
  // disabled button. The offline state itself is the shared ConnectivityIndicator
  // asserted above.
  await expect(page.locator('#main-content').getByRole('button', { name: /تحديث/ })).toHaveCount(0);

  // The visited auth shell answers offline too (#447): the reload paints the
  // login form, not the offline page. The submit — which still needs Turnstile
  // and Supabase — answers with the inline needs-connection state instead of a
  // credential error.
  await page.goto(`${baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole('heading', { name: 'تسجيل الدُّخول' })).toBeVisible();

  await page.fill('#login-email', 'someone@example.com');
  await page.fill('#login-password', 'not-the-password');
  await page.getByRole('button', { name: 'تسجيل الدُّخول' }).click();
  const needsConnection = page.getByRole('status').filter({ hasText: 'يتطلَّب الاتصال بالإنترنت' });
  await expect(needsConnection).toBeVisible();

  await context.close();
});

test('a never-visited public route deep-links offline from the install precache', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // The install event precaches the build's public route shells; the helper
  // returns only after the worker controls the page, which is after `install`
  // has settled. `/privacy` is never opened in this context.
  await gotoUnderWorkerControl(page, `${baseURL}/rates`);
  await expect(page.getByRole('heading', { name: /أسعار الصَّرف/ })).toBeVisible();

  await context.setOffline(true);
  await page.goto(`${baseURL}/privacy`, { waitUntil: 'domcontentloaded' });

  // A hard navigation to a never-visited route must render its own shell, not
  // the offline fallback. The heading is server-rendered into the precached
  // document; the offline page's retry link is the negative control.
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: /سياسة الخصوصيَّة/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'إعادة المحاولة' })).toHaveCount(0);

  // The auth shells are in the precache since #447: an offline navigation to a
  // login page this context never opened lands on the auth document, not on the
  // offline fallback. (The prerendered copy is the Suspense fallback shell the
  // build produced; the interactive offline pass with the real form is the
  // visited-page test above.)
  await page.goto(`${baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole('link', { name: 'إعادة المحاولة' })).toHaveCount(0);

  // The account shells ride the SWR cache since #448: the document is static
  // and carries nothing account-bearing, so an account deep link this context
  // never opened lands on its own shell, not on the offline fallback (ADR-0031's
  // amendment). Everything account-bearing in it paints from client state.
  await page.goto(`${baseURL}/account`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('link', { name: 'إعادة المحاولة' })).toHaveCount(0);

  // The product dashboard roots are data-free shells since #449 (ADR-0073), so
  // the install precache covers one this context never opened: an offline deep
  // link paints the product's own heading, and the Local Store (empty for a
  // guest here) is what the client awaits, not `/offline`.
  await page.goto(`${baseURL}/habitflow`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/habitflow$/);
  await expect(page.getByRole('heading', { name: 'تتبُّع العادات' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'إعادة المحاولة' })).toHaveCount(0);

  // The two Phase 3 shells (#450) are data-free documents too: a deep link to a
  // never-opened `/downloader` or `/consultation/book` paints its own chrome,
  // and the reads underneath it answer with their own needs-connection states.
  await page.goto(`${baseURL}/downloader`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/downloader$/);
  await expect(page.getByRole('heading', { name: 'مُنزِّل الوسائط' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'إعادة المحاولة' })).toHaveCount(0);

  await page.goto(`${baseURL}/consultation/book`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/consultation\/book$/);
  await expect(page.getByRole('heading', { name: 'حجز استشارة' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'إعادة المحاولة' })).toHaveCount(0);

  await context.close();
});

test('a community search names the connection when the request never leaves, and retries in place', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await gotoUnderWorkerControl(page, `${baseURL}/community`);
  const search = page.getByRole('combobox', { name: 'ابحث عن الأعضاء أو المنشورات' });
  await expect(search).toBeVisible();

  // A failed read is not "no results" (ADR-0031): the panel names the
  // connection instead, and carries the same request as its retry (#475).
  await context.setOffline(true);
  await search.fill('اختبار');
  const needsConnection = page.getByRole('status').filter({ hasText: 'يتطلَّب الاتصال بالإنترنت' });
  await expect(needsConnection).toBeVisible();
  await expect(page.getByText(/لا توجد نتائج/)).toHaveCount(0);

  await context.setOffline(false);
  await needsConnection.getByRole('button', { name: 'إعادة المحاولة' }).click();
  await expect(needsConnection).toHaveCount(0);

  await context.close();
});

test('a community load-more that never leaves keeps the loaded page and names the connection', async ({
  page,
  baseURL,
}) => {
  // The first page is answered here so the feed has a cursor to load more from;
  // only the second request fails, which is the state under test.
  const firstPage = {
    posts: [
      {
        id: 'p-seed',
        author_id: 'u-1',
        slug: 'seed',
        content: 'منشور تجريبيّ',
        status: 'published',
        cover_image: null,
        meta_title: null,
        meta_desc: null,
        published_at: '2026-01-01T00:00:00.000Z',
        publish_at: null,
        view_count: 0,
        featured: false,
        community_visible: true,
        reading_time_minutes: 3,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    nextCursor: 'next',
  };

  await page.route(
    (url) => url.pathname === '/api/community/index' && url.searchParams.get('cursor') === 'seed',
    (route) => route.fulfill({ json: firstPage })
  );
  await page.route(
    (url) => url.pathname === '/api/community/index' && url.searchParams.get('cursor') === 'next',
    (route) => route.abort('failed')
  );

  await page.goto(`${baseURL}/community?cursor=seed`);
  await expect(page.getByText('منشور تجريبيّ')).toBeVisible();

  await page.getByRole('link', { name: 'تحميل المزيد من المنشورات' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'يتطلَّب الاتصال بالإنترنت' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'إعادة المحاولة' })).toBeVisible();
  await expect(page.getByText('منشور تجريبيّ')).toBeVisible();
});

test('a never-visited dynamic detail route lands on /offline, then renders after one visit', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // A dynamic segment is a pattern, not a document, so the install precache has
  // no shell for `/quran/7` (ADR-0071's #473 amendment). This is the documented
  // third door in the spec's "Limits of instant", pinned here so a precache
  // change cannot move the limit without moving the document with it.
  await gotoUnderWorkerControl(page, `${baseURL}/rates`);
  await expect(page.getByRole('heading', { name: /أسعار الصَّرف/ })).toBeVisible();

  await context.setOffline(true);
  await page.goto(`${baseURL}/quran/7`, { waitUntil: 'domcontentloaded' });

  // The offline page answers: its retry control is the marker, and the surah's
  // own heading is the negative control.
  await expect(page.getByRole('link', { name: 'إعادة المحاولة' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'الأعراف' })).toHaveCount(0);

  // The limit is one visit deep, not one segment deep: opening the same detail
  // route online caches its document like any other navigation, and the next
  // offline open paints the surah instead of `/offline`.
  await context.setOffline(false);
  await page.goto(`${baseURL}/quran/7`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'الأعراف' })).toBeVisible();

  // The stored copy is written after the response is returned, so wait for the
  // entry rather than racing the reload against the background write.
  await expect
    .poll(() => page.evaluate(() => caches.match('/quran/7').then((hit) => Boolean(hit))), {
      timeout: 15_000,
    })
    .toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'الأعراف' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'إعادة المحاولة' })).toHaveCount(0);

  await context.close();
});
