import { test, expect, type Page } from '@playwright/test';
import { gotoUnderWorkerControl, waitForAppHydrated } from './worker-control';

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

/**
 * Waits for the worker's background route refresh to reach every path (#489).
 *
 * The install fetches only the fixed shell; the build's route documents arrive
 * in idle windows after activation, so a spec that goes offline straight after
 * the first load is racing a refresh that has not finished. Polling the worker's
 * own cache is the honest signal — the page cannot know when the list is done,
 * and the assertion below is exactly "the shell is on this device". It is an
 * `expect.poll` over an async `evaluate`, not `waitForFunction`: a `waitForFunction`
 * predicate that returns a promise is treated as truthy at once, so it would
 * pass on an empty cache.
 */
async function waitForCachedRoutes(page: Page, paths: string[]): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async (routes) => {
          const name = (await caches.keys()).find((key) => key.startsWith('royaraqamia-data-'));
          if (!name) return false;
          const cache = await caches.open(name);
          for (const route of routes) {
            if (!(await cache.match(route))) return false;
          }
          return true;
        }, paths),
      { timeout: 90_000, intervals: [250, 500, 1000] }
    )
    .toBe(true);
}

/**
 * Waits until the background route refresh has fetched `path`'s document *and*
 * the `/_next/static` chunks it names (#490), so the route can actually run
 * offline rather than only paint. The worker queues those chunks itself; this
 * reads the same references out of the cached document, which is the only
 * honest signal a test has.
 */
async function waitForRunnableRoute(page: Page, path: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async (route) => {
          const data = (await caches.keys()).find((key) => key.startsWith('royaraqamia-data-'));
          if (!data) return false;
          const cache = await caches.open(data);
          const document = await cache.match(route);
          if (!document) return false;
          const html = await document.text();
          const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)"/g)].map(
            (match) => match[1]
          );
          if (assets.length === 0) return false;
          for (const asset of assets) {
            if (!(await caches.match(asset as string))) return false;
          }
          return true;
        }, path),
      { timeout: 90_000, intervals: [250, 500, 1000] }
    )
    .toBe(true);
}

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

test('a never-visited public route deep-links offline from the background precache', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // The build's public route shells refresh in idle windows after the worker
  // takes control (#489), so this waits for the shells it is about to request
  // rather than assuming install fetched the whole list. None of these paths is
  // opened in this context before the offline pass.
  await gotoUnderWorkerControl(page, `${baseURL}/rates`);
  await expect(page.getByRole('heading', { name: /أسعار الصَّرف/ })).toBeVisible();
  await waitForCachedRoutes(page, [
    '/privacy',
    '/auth/login',
    '/account',
    '/habitflow',
    '/downloader',
    '/consultation/book',
  ]);

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
  // the background precache covers one this context never opened: an offline
  // deep link paints the product's own heading, and the Local Store (empty for a
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
  const search = page.getByRole('combobox', { name: 'ابحث عن أشخاص أو منشورات' });
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

// The card a prefix serve draws (#490). Its own copy is the marker; the shared
// needs-connection title rides along with it.
const OFFLINE_ROUTE_CARD = 'هذا الرابط غير متاح دون اتصال';

/** The `/offline` document's own heading, never a prefix-served shell's. */
function offlinePageHeading(page: Page) {
  return page.getByRole('heading', { name: /غير متَّصل/ });
}

test('a never-visited dynamic detail route keeps its parent shell and names the missing link', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // A dynamic segment is a pattern, not a document, so the route precache has
  // no shell for `/quran/7` (ADR-0071). It does hold every static ancestor, and
  // since #490 a miss is answered with the longest one the device has — which is
  // the fix for the worst answer this worker used to give: `/offline`, a
  // different screen replacing the one the user asked for.
  await gotoUnderWorkerControl(page, `${baseURL}/rates`);
  await expect(page.getByRole('heading', { name: /أسعار الصَّرف/ })).toBeVisible();
  await waitForCachedRoutes(page, ['/quran', '/verify', '/']);

  await context.setOffline(true);

  // `/quran/<surah>`: the reader's own chrome answers at the requested URL, and
  // the card says the surah itself is not on this device.
  await page.goto(`${baseURL}/quran/7`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/quran\/7$/);
  await expect(page.getByRole('heading', { name: 'القرآن الكريم' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: OFFLINE_ROUTE_CARD })).toBeVisible();
  await expect(offlinePageHeading(page)).toHaveCount(0);
  // The surah is what the link asked for, and it is not what rendered.
  await expect(page.getByRole('heading', { name: 'الأعراف' })).toHaveCount(0);

  // `/verify/<code>` borrows its segment's shell the same way.
  await page.goto(`${baseURL}/verify/ABC-123`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/verify\/ABC-123$/);
  await expect(page.getByRole('heading', { name: 'التَّحقُّق من الشَّهادة' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: OFFLINE_ROUTE_CARD })).toBeVisible();
  await expect(offlinePageHeading(page)).toHaveCount(0);

  // `/u` is a segment with no document of its own, so the chain walks past it to
  // the homepage — the one ancestor every installed device holds.
  await page.goto(`${baseURL}/u/someone`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/u\/someone$/);
  await expect(page.getByRole('heading', { name: /شريكك الاستراتيجي/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: OFFLINE_ROUTE_CARD })).toBeVisible();
  await expect(offlinePageHeading(page)).toHaveCount(0);

  // The limit is one visit deep, not one segment deep: opening the same detail
  // route online caches its document like any other navigation, so the card is
  // gone and the next offline open paints the surah.
  await context.setOffline(false);
  await page.goto(`${baseURL}/quran/7`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'الأعراف' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: OFFLINE_ROUTE_CARD })).toHaveCount(0);

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
  await expect(page.getByRole('status').filter({ hasText: OFFLINE_ROUTE_CARD })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'إعادة المحاولة' })).toHaveCount(0);

  await context.close();
});

/**
 * The RSC cache key (#492). Every client navigation and prefetch appends `_rsc`
 * to its URL — a hash of the request's own headers — so two navigations to the
 * same page from different router states arrive on different URLs. Keyed by the
 * full URL, the worker missed both and each miss was a network round trip inside
 * an otherwise painted page. Live payloads now share one key, and this proves it
 * where a user feels it: offline.
 *
 * A *prefetched* body is deliberately not shared — it is partial by design, and
 * Next abandons the soft navigation for a full document load when it is handed
 * one. That boundary is `sw.test.mjs`'s; here the payload under test is the one a
 * navigation fetched.
 */
test('a repeat client navigation is answered from the cache with the radio off', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  /** The live flight entry this device holds for `/privacy`. */
  const liveEntry = () =>
    page.evaluate(async () => {
      const name = (await caches.keys()).find((key) => key.startsWith('royaraqamia-data-'));
      if (!name) return [];
      const cache = await caches.open(name);
      return (await cache.keys())
        .map((request) => new URL(request.url))
        .filter((url) => url.pathname === '/privacy' && url.search === '?_rsc=1')
        .map((url) => url.search);
    });

  // The first navigation writes both halves of the page: the document, and the
  // live flight payload under the normalised key. It has to be a *client*
  // navigation — a hard load paints the document and never asks for flight data.
  await gotoUnderWorkerControl(page, `${baseURL}/app-info`);
  await page.locator('a[href="/privacy"]').first().click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: /سياسة الخصوصيَّة/ })).toBeVisible();
  await expect
    .poll(liveEntry, { timeout: 30_000, intervals: [250, 500, 1000] })
    .toEqual(['?_rsc=1']);

  // A fresh router state, and the origin of the repeat navigation below.
  await gotoUnderWorkerControl(page, `${baseURL}/app-info`);

  // Both documents and their chunks have to be on this device before the radio
  // goes off: the click below must be a client navigation, not a reload that
  // happens to render.
  await waitForCachedRoutes(page, ['/app-info', '/privacy']);
  await waitForRunnableRoute(page, '/app-info');
  await waitForRunnableRoute(page, '/privacy');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppHydrated(page);

  await context.setOffline(true);

  // A marker that only survives a client navigation: a document load would wipe
  // it, and then this assertion — not the heading — is what fails.
  await page.evaluate(() => {
    (window as unknown as { __softNavigation?: boolean }).__softNavigation = true;
  });
  await page.locator('a[href="/privacy"]').first().click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: /سياسة الخصوصيَّة/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __softNavigation?: boolean }).__softNavigation === true
    )
  ).toBe(true);

  // And the key is why: a hash the worker has never seen — this navigation's own
  // — is still answered from the one entry, with no network to ask.
  const flight = await page.evaluate(async () => {
    const response = await fetch('/privacy?_rsc=a-state-the-worker-never-saw');
    return {
      ok: response.ok,
      type: response.headers.get('content-type') || '',
      body: await response.text(),
    };
  });
  expect(flight.ok).toBe(true);
  expect(flight.type).not.toContain('text/html');
  expect(flight.body.length).toBeGreaterThan(0);

  // Still one entry: the repeat navigation read it, it did not add a second.
  expect(await liveEntry()).toEqual(['?_rsc=1']);

  await context.close();
});
