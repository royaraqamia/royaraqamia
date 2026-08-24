import { test, expect, type Page } from '@playwright/test';

/**
 * Assert the page cannot actually scroll horizontally (real overflow, not
 * scrollWidth noise masked by overflow-x: hidden).
 */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const canScroll = await page.evaluate(() => {
    const before = window.scrollX;
    window.scrollBy(1000, 0);
    const after = window.scrollX;
    window.scrollTo(0, 0);
    return after > before;
  });
  expect(canScroll, 'Page is horizontally scrollable — content overflows viewport').toBe(false);
}

/**
 * Visual + structural verification of the HabitFlow CalendarGrid across
 * viewports. Authenticates through /auth/api/login (Turnstile-safe), seeds a
 * couple of habits if the account is empty, then sweeps viewports asserting:
 *  - no horizontal page overflow
 *  - no day-number clipping inside any [data-cell]
 * and captures full-page + calendar-section screenshots for human review.
 *
 * Run: npx playwright test e2e/habitflow-calendar-visual.spec.ts --project=existing-tests
 */

const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'desktop-1536', width: 1536, height: 960 },
];

const CALENDAR_SECTION = 'section[aria-label="تقويم سلسلة الإنجاز"]';

// Use the full Chromium build (headless shell not installed locally)
test.use({ channel: 'chromium' });

async function openAddModal(page: Page): Promise<void> {
  // The click may land before React hydration attaches handlers — retry until
  // the dialog input actually appears.
  for (let i = 0; i < 6; i++) {
    await page.click('#btn-create-habit');
    try {
      await page.waitForSelector('#input-add-habit-name', { state: 'visible', timeout: 4_000 });
      return;
    } catch {
      // not hydrated yet — retry
    }
  }
  throw new Error('Add-habit modal did not open after retries');
}

async function createHabitViaModal(page: Page, name: string): Promise<void> {
  await openAddModal(page);
  await page.fill('#input-add-habit-name', name);
  await page.click('#btn-submit-add-habit');
  await expect(page.locator('#input-add-habit-name')).toHaveCount(0, { timeout: 20_000 });
}

async function toggleFirstHabit(page: Page): Promise<void> {
  const firstCheck = page.locator('[id^="check-habit-"]').first();
  for (let i = 0; i < 6; i++) {
    if ((await firstCheck.count()) === 0) return;
    if ((await firstCheck.getAttribute('aria-pressed')) === 'true') return;
    await firstCheck.click();
    await page.waitForTimeout(700);
  }
}

async function expectNoCellClipping(page: Page): Promise<void> {
  const clipped = await page.evaluate(() => {
    const results: string[] = [];
    const cells = document.querySelectorAll<HTMLButtonElement>('button[data-cell]');
    cells.forEach((cell) => {
      const cellRect = cell.getBoundingClientRect();
      const num = cell.querySelector('span');
      if (!num) return;
      const r = num.getBoundingClientRect();
      const fitsH = r.left >= cellRect.left - 1 && r.right <= cellRect.right + 1;
      const fitsV = r.top >= cellRect.top - 1 && r.bottom <= cellRect.bottom + 1;
      if (!fitsH || !fitsV) {
        results.push(
          `"${num.textContent}" ${Math.round(r.width)}x${Math.round(r.height)} in ${Math.round(
            cellRect.width
          )}x${Math.round(cellRect.height)}`
        );
      }
    });
    return results;
  });
  expect(clipped, `Clipped day numbers: ${clipped.join(', ')}`).toHaveLength(0);
}

test('habitflow calendar grid visual sweep', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);

  // context.request shares cookie storage with pages in the same context
  const context = await browser.newContext();
  const page = await context.newPage();

  const loginRes = await context.request.post(`${baseURL}/auth/api/login`, {
    data: { email: EMAIL, password: PASSWORD, redirectTo: null, turnstileToken: '' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(loginRes.ok(), `API login failed: ${loginRes.status()}`).toBeTruthy();

  await page.goto('/habitflow/app', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForSelector('#btn-create-habit', { timeout: 60_000 });

  // Seed two habits if the account has none (idempotent across runs)
  const habitCount = await page.locator('[id^="check-habit-"]').count();
  if (habitCount === 0) {
    await createHabitViaModal(page, 'قراءة');
    await createHabitViaModal(page, 'رياضة');
  }

  // Complete the first habit so the grid shows mixed states
  await toggleFirstHabit(page);
  await page.waitForTimeout(500);

  // Light-mode sweep
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(400);

    await expectNoHorizontalOverflow(page);
    await expectNoCellClipping(page);
    await expect(page.locator(CALENDAR_SECTION)).toBeVisible();

    await page.screenshot({
      path: `e2e/screenshots/calendar-${vp.name}-light-full.png`,
      fullPage: true,
    });
    await page
      .locator(CALENDAR_SECTION)
      .screenshot({ path: `e2e/screenshots/calendar-${vp.name}-light-section.png` });
  }

  // Dark-mode spot checks
  for (const vp of [
    { name: 'mobile-375', width: 375, height: 812 },
    { name: 'desktop-1536', width: 1536, height: 960 },
  ]) {
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#btn-create-habit', { timeout: 60_000 });
    await page.waitForTimeout(400);

    await expectNoHorizontalOverflow(page);
    await expectNoCellClipping(page);

    await page
      .locator(CALENDAR_SECTION)
      .screenshot({ path: `e2e/screenshots/calendar-${vp.name}-dark-section.png` });
  }

  await page.evaluate(() => localStorage.setItem('theme', 'light'));
});
