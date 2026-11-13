import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect, type BrowserContext, type Page } from '@playwright/test';

import QRCode from 'qrcode';
import {
  clearVisualCommunityPosts,
  clearVisualLink,
  clearVisualNews,
  clearVisualProfile,
  COMMUNITY_SEED_PREFIX,
  protectVisualLink,
  seedVisualLink,
  seedVisualNews,
  seedVisualProfile,
  seedHomeServices,
  signInAsVisualAccount,
  VISUAL_HOME_SERVICES,
  VISUAL_ACCOUNT_MISSING,
  VISUAL_PROFILE,
  visualCredentials,
} from './visual-fixture';

const ROOT = process.cwd();
const GATE = join(ROOT, 'docs', 'mobile', 'visual-gate.json');

/**
 * The page half of the visual gate (#874, ADR-0118).
 *
 * For every surface in `docs/mobile/visual-gate.json` this records, at the app's
 * own viewport and colour scheme:
 *
 *   e2e/__visual__/<surface>/web.json   each contract element's box and styles
 *   e2e/__visual__/<surface>/web.png    the page, at the same size the screen is
 *                                       composed at
 *
 * The app side writes `app.json` and `app.png` beside them from its Robolectric
 * test, and `check:visual` compares the two. This spec records; it asserts only
 * that the contract's elements are present, because a recording of a page that
 * lost an element would otherwise be the thing that makes the gate pass.
 *
 * It signs in as the gate's own fixture account (#920), never the shared offline
 * account the other specs write to. Without `E2E_VISUAL_EMAIL` /
 * `E2E_VISUAL_PASSWORD` the suite skips before it measures anything, so a
 * missing account is a declared state with no evidence rather than a recording
 * of the wrong member.
 *
 * Run it with `npm run visual:capture` (which selects this project), never by
 * hand: the viewport, DPR and locale are the measurement.
 */

const gate = JSON.parse(readFileSync(GATE, 'utf8'));
// The frame (#902) is the chrome the shell draws around a screen rather than a
// screen: same recording per state, same evidence shape, no row in screens.json.
const frame = gate.frame?.id ? [{ ...gate.frame, surface: gate.frame.id }] : [];
const surfaces = [...(gate.surfaces ?? []), ...frame];

/** The app's phone: 393 x 852 CSS px at DPR 2.75, dark, Arabic, RTL. */
const VIEWPORT = { width: 393, height: 852 };
const DEVICE_SCALE = 2.75;

/** The origin the spec signs in on: the page's cookie host must match it. */
function projectBaseURL(): string {
  return test.info().project.use.baseURL ?? 'http://localhost:3000';
}

/**
 * Hides the Next.js development indicator.
 *
 * It is development-only chrome, not the product: CI records a production build
 * where it does not exist. A sheet at the bottom of the viewport would otherwise
 * carry a floating "N" the app has no reason to draw, and the empty card reaches
 * far enough down to include it too.
 */
async function hideDevIndicator(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

interface Measured {
  name: string;
  selector: string;
  properties: string[];
}

/**
 * Measures one element the way the app will be measured: a box in CSS pixels
 * relative to the viewport, and the properties the contract named.
 *
 * Numbers are rounded to two decimals - below that is float noise in a browser
 * that resolves `em` through a 16px root - and anything that does not parse as a
 * number is kept as the string the browser said, so `normal` stays `normal`
 * instead of becoming a wrong zero.
 */
async function measure(page: Page, elements: Measured[]) {
  return page.evaluate((specs: Measured[]) => {
    const number = (value: string): number | string => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : value;
    };

    // Tailwind 4 states colours in `oklab()`, which is not a value either client can
    // compare against a Compose colour, and assigning one to a canvas keeps the
    // `oklab()` serialisation. Painting it and reading the pixel is the sRGB value
    // the app can produce from its tokens, alpha included.
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const color = (value: string): string => {
      if (!context) return value;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const data = context.getImageData(0, 0, 1, 1).data;
      const [r, g, b, alpha] = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 255];
      return `rgba(${r}, ${g}, ${b}, ${Math.round((alpha / 255) * 100) / 100})`;
    };

    const out: Record<string, Record<string, number | string>> = {};
    for (const spec of specs) {
      const node = document.querySelector(spec.selector);
      if (!node) throw new Error(`no element matches ${spec.selector}`);
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const props: Record<string, number | string> = {};

      for (const property of spec.properties) {
        switch (property) {
          case 'left':
            props[property] = Math.round(box.left * 100) / 100;
            break;
          case 'top':
            props[property] = Math.round(box.top * 100) / 100;
            break;
          case 'width':
            props[property] = Math.round(box.width * 100) / 100;
            break;
          case 'height':
            props[property] = Math.round(box.height * 100) / 100;
            break;
          case 'radius':
            props[property] = number(style.borderTopLeftRadius);
            break;
          case 'paddingTop':
            props[property] = number(style.paddingTop);
            break;
          case 'paddingRight':
            props[property] = number(style.paddingRight);
            break;
          case 'paddingBottom':
            props[property] = number(style.paddingBottom);
            break;
          case 'paddingLeft':
            props[property] = number(style.paddingLeft);
            break;
          case 'rowGap':
            props[property] = number(style.rowGap);
            break;
          case 'columnGap':
            props[property] = number(style.columnGap);
            break;
          case 'fontSize':
            props[property] = number(style.fontSize);
            break;
          case 'fontWeight':
            props[property] = number(style.fontWeight);
            break;
          case 'lineHeight':
            props[property] = number(style.lineHeight);
            break;
          case 'letterSpacing':
            props[property] = number(style.letterSpacing);
            break;
          case 'color':
            props[property] = color(style.color);
            break;
          case 'backgroundColor':
            props[property] = color(style.backgroundColor);
            break;
          case 'borderTopWidth':
            props[property] = number(style.borderTopWidth);
            break;
          case 'opacity':
            props[property] = number(style.opacity);
            break;
          case 'maxHeight':
            props[property] = number(style.maxHeight);
            break;
          case 'minHeight':
            props[property] = number(style.minHeight);
            break;
          default:
            throw new Error(`the contract asks for ${property}, which this recorder does not read`);
        }
      }
      out[spec.name] = props;
    }
    return out;
  }, elements);
}

/**
 * The rows the community feed's recording seeds.
 *
 * The load-more control only exists on a feed with more rows than one page (9),
 * so the page's state is reached by writing ten rows through the account's own
 * create route and removing them after the capture. The rows are the fixture's,
 * not whatever the site happens to publish: a recording that depends on today's
 * feed is not evidence (ADR-0119). Their slugs are fixed, so the state is the
 * same every run; the cleanup hard-deletes them by account and prefix, because
 * the page's own delete is a tombstone that keeps the unique slug taken.
 */
async function seedCommunityPosts(context: BrowserContext, baseURL: string): Promise<void> {
  for (let index = 1; index <= 10; index += 1) {
    const response = await context.request.post(`${baseURL}/api/community/posts`, {
      data: {
        slug: `${COMMUNITY_SEED_PREFIX}${index}`,
        content: `منشور تجريبي للبوابة ${index}`,
        status: 'published',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok()) {
      throw new Error(
        `community seed ${index} failed: ${response.status()} ${await response.text()}`
      );
    }
  }
}

/**
 * The SpendTrack rows every recording of the surface starts from (#958).
 *
 * A fixed category and expense on the gate's own account (#920), written
 * through the page's own routes so the recording is the page's real pull and
 * not a store poked from the outside. The ids are the fixture's, and the writes
 * are upserts (ADR-0029), so a second run updates these rows instead of adding
 * a second copy of them. Both states seed the same set; the filtered state only
 * narrows the page's view to one category.
 */
const SPENDTRACK_FOOD = 'e2e00000-0000-4000-8000-000000000001';
const SPENDTRACK_TRANSPORT = 'e2e00000-0000-4000-8000-000000000002';
const SPENDTRACK_LUNCH = 'e2e00000-0000-4000-8000-000000000003';
const SPENDTRACK_BUS = 'e2e00000-0000-4000-8000-000000000004';

async function seedSpendtrack(context: BrowserContext, baseURL: string): Promise<void> {
  const headers = { 'Content-Type': 'application/json' };
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const categories = [
    { clientId: SPENDTRACK_FOOD, name: 'طعام', color_hex: '#f97316', updatedAt: now },
    { clientId: SPENDTRACK_TRANSPORT, name: 'مواصلات', color_hex: '#3b82f6', updatedAt: now },
  ];
  for (const category of categories) {
    const response = await context.request.post(`${baseURL}/spendtrack/api/categories`, {
      data: category,
      headers,
    });
    if (!response.ok()) {
      throw new Error(
        `spendtrack category seed failed: ${response.status()} ${await response.text()}`
      );
    }
  }

  const expenses = [
    {
      clientId: SPENDTRACK_LUNCH,
      amount: 100,
      category_id: SPENDTRACK_FOOD,
      date: today,
      description: 'غداء',
      currency: null,
      splits: [],
      updatedAt: now,
    },
    {
      clientId: SPENDTRACK_BUS,
      amount: 50,
      category_id: SPENDTRACK_TRANSPORT,
      date: today,
      description: 'باص',
      currency: null,
      splits: [],
      updatedAt: now,
    },
  ];
  for (const expense of expenses) {
    const response = await context.request.post(`${baseURL}/spendtrack/api/expenses`, {
      data: expense,
      headers,
    });
    if (!response.ok()) {
      throw new Error(
        `spendtrack expense seed failed: ${response.status()} ${await response.text()}`
      );
    }
  }
}

/**
 * What a state does to the page before it is measured.
 *
 * A state is not a second page: it is the same route with something open, a
 * selection made, or a session behind it. Each routine is named by the contract,
 * so a state with no routine fails by name instead of silently recording the page
 * at rest under another state's name. A surface-specific name (`<surface>/<state>`)
 * wins over the shared one, so a state that needs its own rows does not change
 * what every other surface records.
 */
const PREPARE: Record<
  string,
  (page: Page, visit: (origin?: string) => Promise<void>) => Promise<void>
> = {
  'at-rest': async (_page, visit) => {
    await visit();
  },
  // The gate's own member, made visible with one fixed post (#1343). A hidden
  // member is a 404 through the public loader (ADR-0127), so the fixture changes
  // that flag for the recording and the cleanup puts it back. The account is the
  // gate's, never the shared offline one, and the post is removed afterwards.
  'profile/at-rest': async (page, visit) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedVisualProfile(page.context(), baseURL);
    await visit(baseURL);
    await page.locator('[data-visual="profile-posts"]').waitFor({ timeout: 20_000 });
    await expect(page.locator('[data-visual="profile-bio"]')).toHaveText(VISUAL_PROFILE.bio);
  },
  // The frame's second chrome (#967): a drill-down wears no bar, so the page is
  // a real secondary route and the recording is the band and the back control.
  'chrome/secondary': async (_page, visit) => {
    await visit();
  },
  // A list with one row: the guest store takes the write on the device, so the
  // state is reached through the page's own control rather than a fixture row.
  // The new habit is always this browser context's, and the count it produces is
  // one, so the recording does not depend on what an account happens to own.
  'with-count': async (page, visit) => {
    await visit();
    // The dev overlay's own button sits over the FAB; the recording is of the
    // page, not of the overlay, and CI runs a production build with neither.
    await page.locator('#btn-create-habit').click({ force: true });
    await page.locator('#input-add-habit-name').fill('قراءة');
    await page.locator('#btn-submit-add-habit').click();
    await page.locator('[data-visual="habitflow-count"]').waitFor({ timeout: 20_000 });
  },
  // The signed-in shortener: the same route with a session behind it, so the
  // custom code and password blocks are drawn. The account is the gate's own
  // (#920), never the shared offline one the other specs write to, and its
  // owned rows are the fixed link below rather than whatever a previous run
  // left. The recording itself is the form; the link and its clicks keep the
  // account settled for the states that read it next (#941, #962).
  'signed-in': async (page, visit) => {
    // The cookie is set for the site's own host (`NEXT_PUBLIC_SITE_URL`), so the
    // sign-in and the navigation must share it: a `127.0.0.1` login leaves the
    // session on a host the page never asks for.
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedVisualLink(page.context(), baseURL);
    await visit(baseURL);
    // The session lands after the first paint, and the state is the signed-in form
    // or nothing: waiting for its first field is what makes the recording that state.
    await page.locator('[data-visual="custom-label"]').waitFor({ timeout: 20_000 });
  },
  // The owned list's row at rest (#941). The fixture link gives the account one
  // settled row, and the password marker is what makes the row draw the pill the
  // contract measures - the clicks that settle the analytics were written before
  // it, because a protected link answers a click with the unlock page.
  'account-links/at-rest': async (page, visit) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedVisualLink(page.context(), baseURL);
    await protectVisualLink(page.context(), baseURL);
    await visit(baseURL);
    await page.locator('[data-visual="link-row-summary"]').first().waitFor({ timeout: 20_000 });
  },
  // The bulk bar with its one row selected (#942), so the count is the
  // `{selected} من {total}` form and the actions are enabled. The bar itself is
  // drawn whenever the account owns a row; the selection is what makes the state
  // the page's bulk bar rather than the list at rest.
  'account-links/bulk-bar': async (page, visit) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedVisualLink(page.context(), baseURL);
    await protectVisualLink(page.context(), baseURL);
    await visit(baseURL);
    await page.locator('[data-visual="link-bulk-bar"]').waitFor({ timeout: 20_000 });
    await page.locator('[data-visual="link-bulk-select-all"]').click();
    await expect(page.locator('[data-visual="link-bulk-copy"]')).toBeEnabled();
  },
  // The QR dialog the row's more menu opens (#943). The fixture link is the
  // same settled row the at-rest state draws, so the dialog's URL is the fixed
  // short link rather than whatever an account owns; the header is what the
  // contract measures, and it is drawn before the encoder answers.
  'account-links/qr': async (page) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedVisualLink(page.context(), baseURL);
    await protectVisualLink(page.context(), baseURL);
    // The dialog is opened by the row's own control, so the shared `visit`
    // cannot wait for the capture region first: it only exists after the menu.
    await page.goto(new URL('/account/links', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-visual="link-row-more"]').first().waitFor({ timeout: 20_000 });
    await page.locator('[data-visual="link-row-more"]').first().click();
    await page.locator('[data-visual="link-row-qr"]').click();
    await page.locator('[data-visual="link-qr-header"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.fonts.ready);
  },
  // The edit dialog the row's more menu opens (#944). The fixture link is the
  // same settled row the at-rest state draws, so the dialog edits the fixed
  // short link; the header is what the contract measures.
  'account-links/edit': async (page) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedVisualLink(page.context(), baseURL);
    await protectVisualLink(page.context(), baseURL);
    await page.goto(new URL('/account/links', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-visual="link-row-more"]').first().waitFor({ timeout: 20_000 });
    await page.locator('[data-visual="link-row-more"]').first().click();
    await page.locator('[data-visual="link-row-edit"]').click();
    await page.locator('[data-visual="link-edit-header"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.fonts.ready);
  },
  // The analytics drawer the row's analytics action opens (#962). The fixture
  // link is the same settled row, and its three clicks are what the drawer
  // reads: the presets are the ready signal, and the capture is the click chart
  // (#963), which is server-independent once the drawer has answered.
  'account-links/analytics': async (page) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedVisualLink(page.context(), baseURL);
    await protectVisualLink(page.context(), baseURL);
    await page.goto(new URL('/account/links', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-visual="link-row-analytics"]').first().waitFor({
      timeout: 20_000,
    });
    await page.locator('[data-visual="link-row-analytics"]').first().click();
    await page.locator('[data-visual="link-analytics-presets"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.fonts.ready);
  },
  // The community feed's load-more is the region the gate measures, and it only
  // exists past the first page. The fixture account seeds ten rows and the
  // cleanup below removes them, so the feed after the run is the feed before it.
  'community/at-rest': async (page, visit) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await clearVisualCommunityPosts(page.context(), baseURL);
    await seedCommunityPosts(page.context(), baseURL);
    await visit(baseURL);
    await page.locator('[data-visual="community-load-more"]').waitFor({ timeout: 20_000 });
  },
  // The dashboard with the fixture's two rows (#958). The page paints from its
  // Local Store and pulls on open, so the rows are written through the page's own
  // routes first and the row is what makes the recording that state.
  'spendtrack/at-rest': async (page, visit) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedSpendtrack(page.context(), baseURL);
    await visit(baseURL);
    await page.locator('[data-visual="spendtrack-row"]').first().waitFor({ timeout: 30_000 });
  },
  // The same dashboard narrowed to one category: the filter is the page's own
  // view state, carried in the URL, so the state is a real query rather than a
  // second seed. The row still exists and the boxes are unchanged.
  'spendtrack/filtered': async (page) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedSpendtrack(page.context(), baseURL);
    await page.goto(
      new URL(`/?tab=/spendtrack&categories=${SPENDTRACK_FOOD}`, baseURL).toString(),
      {
        waitUntil: 'domcontentloaded',
      }
    );
    await page.locator('[data-visual="spendtrack-row"]').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.fonts.ready);
  },
  // The categories page with the same fixture's categories (#959). The page
  // paints them from the Local Store and pulls on open, so the rows are written
  // through the page's own route first and the row is what makes the recording
  // that state. The empty state is the same list with no rows; this state is the
  // populated one the page opens on for an account that has categories.
  'spendtrack-categories/at-rest': async (page, visit) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedSpendtrack(page.context(), baseURL);
    await visit(baseURL);
    await page.locator('[data-visual="spendtrack-category-row"]').first().waitFor({
      timeout: 30_000,
    });
  },
  // The create-expense dialog with a refused field (#960). `?create=1` is the
  // page's own way to open it, and submitting the empty amount draws the page's
  // own sentence under the field; the recording is the field, because the page's
  // and the app's frames are not the same height and the dialog is its own region
  // (ADR-0119).
  'spendtrack/expense-dialog': async (page) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedSpendtrack(page.context(), baseURL);
    await page.goto(new URL('/?tab=/spendtrack&create=1', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-visual="spendtrack-expense-dialog"]').waitFor({ timeout: 30_000 });
    await page.locator('[data-visual="spendtrack-expense-submit"]').click();
    await page.locator('[data-visual="spendtrack-expense-error"]').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.fonts.ready);
  },
  // The create-category dialog with a refused name (#960), reached through the
  // categories page's own control. The dialog is the same surface's second
  // state; the page's sentence is what the refused field draws.
  'spendtrack/category-dialog': async (page) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedSpendtrack(page.context(), baseURL);
    await page.goto(new URL('/spendtrack/categories', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-visual="spendtrack-category-create"]').click();
    await page.locator('[data-visual="spendtrack-category-dialog"]').waitFor({ timeout: 30_000 });
    await page.locator('[data-visual="spendtrack-category-submit"]').click();
    await page.locator('[data-visual="spendtrack-category-error"]').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.fonts.ready);
  },
  // The CSV flow's two controls (#961). The page draws them for a signed-in
  // account beside the same filter the dashboard is reading; the export asks the
  // page's own route, so the recording is the control and the file it hands out
  // is that route's answer rather than a second format.
  'spendtrack/csv': async (page, visit) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedSpendtrack(page.context(), baseURL);
    await visit(baseURL);
    await page.locator('[data-visual="spendtrack-csv"]').waitFor({ timeout: 30_000 });
  },
  // The homepage strip with the fixture's two apps (#1194). The account's order
  // is written first, so the pills and their selected state are the same every
  // run rather than whatever the last capture left on the account.
  'home/strip': async (page, visit) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedHomeServices(page.context(), baseURL, VISUAL_HOME_SERVICES);
    await visit(baseURL);
    await page.locator('[data-visual="home-app-strip"]').waitFor({ timeout: 30_000 });
    // The page paints its Arabic faces with `display: swap`, so a strip measured
    // before they land is a strip in the fallback face.
    await page.evaluate(() => document.fonts.ready);
    await hideDevIndicator(page);
    await page.waitForTimeout(400);
  },
  // The picker over the strip: the sheet is opened by the strip's own end
  // control, and the body is the capture region, so the shared `visit` cannot
  // wait for it first.
  'home/picker': async (page) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedHomeServices(page.context(), baseURL, VISUAL_HOME_SERVICES);
    await page.goto(new URL('/', baseURL).toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-visual="home-new-app"]').waitFor({ timeout: 30_000 });
    await page.locator('[data-visual="home-new-app"]').click();
    await page.locator('[data-visual="services-sheet"]').waitFor({ timeout: 30_000 });
    await hideDevIndicator(page);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.fonts.ready);
  },
  // The digest at rest (#1345): the day is pinned to the fixture's fixed one, so
  // the card the gate measures is the same every run rather than today's news
  // (ADR-0119). The page is the door's own tab address; `/news` now redirects
  // there (ADR-0168).
  'news/at-rest': async (page, visit) => {
    await seedVisualNews();
    await visit();
    await page.locator('[data-visual="news-story"]').first().waitFor({ timeout: 30_000 });
    // The pinned date survives the redirect from `/news`; without it the page
    // would record whatever the nightly workflow published this morning.
    await expect(page.locator('[data-visual="news-story"] h3')).toHaveText(
      'خبر تجريبي لبوابة القياس'
    );
    await page.evaluate(() => document.fonts.ready);
  },
  // Nothing to show, offline (#1345): the board read never reaches the server,
  // so the page names the connection instead of an empty digest (ADR-0031).
  'news/needs-connection': async (page, visit) => {
    await page.route('**/api/news/board*', (route) => route.abort('internetdisconnected'));
    await visit();
    await page.locator('[data-visual="news-unavailable"]').waitFor({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
  },
  // The Scanner at rest (#1344): the public route, with the camera not started.
  // Nothing is seeded - the state is the page's own first paint - so the card's
  // viewfinder, start control and upload box are the recording.
  'scan/at-rest': async (page, visit) => {
    await visit();
    await page.locator('[data-visual="card"]').waitFor({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
  },
  // The camera refused (#1344): the page asks for the camera and the browser
  // says no. The user agent names the shell, so the page draws the app's own
  // system-settings sentence rather than the browser's - the two clients are
  // then recording the same words. The stub is an init script because
  // `getUserMedia` is read when the control is pressed, after the page loads.
  'scan/denied': async (page, visit) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36 RoyaraqamiaShell/1.0.6+20006',
        configurable: true,
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: () =>
            Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
        },
        configurable: true,
      });
    });
    await visit();
    await page.locator('[data-visual="start"]').click();
    await page.locator('[data-visual="notice"]').waitFor({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
  },
  // A decoded payload (#1344). The picture is the Scanner's own fixture symbol,
  // written with the same `qrcode` encoder its end-to-end spec uses, and the
  // page's own upload, classification and result rendering run for real. The
  // browser's detector is pinned to the fixture because this project runs under
  // device emulation where the WASM fallback does not answer; the decoder itself
  // is covered by `e2e/scan.spec.ts`. The payload is plain text, so no
  // certificate lookup is made.
  'scan/result': async (page) => {
    const baseURL = projectBaseURL();
    const buffer = await QRCode.toBuffer('royaraqamia.com/scan-fixture', {
      type: 'png',
      width: 320,
    });
    await page.addInitScript(() => {
      class FixtureBarcodeDetector {
        static async getSupportedFormats() {
          return ['qr_code'];
        }
        async detect() {
          return [
            {
              rawValue: 'royaraqamia.com/scan-fixture',
              format: 'qr_code',
              boundingBox: new DOMRectReadOnly(0, 0, 320, 320),
            },
          ];
        }
      }
      Object.defineProperty(window, 'BarcodeDetector', {
        value: FixtureBarcodeDetector,
        configurable: true,
      });
    });
    // The capture region only exists after the decode, so the shared `visit`
    // cannot wait for it first: the page is navigated directly and the upload is
    // what makes the state.
    await page.goto(new URL('/scan', baseURL).toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-visual="card"]').waitFor({ timeout: 30_000 });
    await page.getByLabel('اختيار صورة تحتوي على رمز').setInputFiles({
      name: 'scan-fixture.png',
      mimeType: 'image/png',
      buffer,
    });
    await page.locator('[data-visual="result-card"]').waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
  },
  // The first-run door: the same account with no apps, which is the state the
  // empty card is drawn in. The card is the capture region, not the page: its
  // frame is the document's, and the app's is the shell's.
  'home/empty': async (page, visit) => {
    const baseURL = projectBaseURL();
    await signInAsVisualAccount(page.context(), baseURL);
    await seedHomeServices(page.context(), baseURL, []);
    await visit(baseURL);
    await page.locator('[data-visual="home-empty"]').waitFor({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await hideDevIndicator(page);
    await page.waitForTimeout(400);
  },
};

/** What a state removes after its recording, so a seed is never left behind. */
const CLEANUP: Record<string, (page: Page) => Promise<void>> = {
  'profile/at-rest': async (page) => {
    await clearVisualProfile(page.context(), projectBaseURL());
  },
  'linksnap/signed-in': async (page) => {
    await clearVisualLink(page.context(), projectBaseURL());
  },
  'account-links/at-rest': async (page) => {
    await clearVisualLink(page.context(), projectBaseURL());
  },
  'account-links/bulk-bar': async (page) => {
    await clearVisualLink(page.context(), projectBaseURL());
  },
  'account-links/qr': async (page) => {
    await clearVisualLink(page.context(), projectBaseURL());
  },
  'account-links/edit': async (page) => {
    await clearVisualLink(page.context(), projectBaseURL());
  },
  'account-links/analytics': async (page) => {
    await clearVisualLink(page.context(), projectBaseURL());
  },
  'community/at-rest': async (page) => {
    await clearVisualCommunityPosts(page.context(), projectBaseURL());
  },
  'news/at-rest': async () => {
    await clearVisualNews();
  },
};

test.describe('the visual gate', () => {
  // The gate records with its own account (#920). Without the pair it skips
  // before any state is measured, so nothing is written under the shared
  // offline account and `check:visual` reports the state as declared and not
  // captured rather than recording the wrong member. The list reporter does not
  // echo an annotation, so the reason is printed as well.
  const credentials = visualCredentials();
  if (!credentials) console.log(VISUAL_ACCOUNT_MISSING);
  test.skip(!credentials, VISUAL_ACCOUNT_MISSING);
  test.skip(surfaces.length === 0, 'no surface is under the gate yet (#874)');

  for (const surface of surfaces) {
    for (const state of surface.states ?? []) {
      test(`${surface.surface}/${state.name}: the page is measured and captured`, async ({
        page,
      }) => {
        const contract = JSON.parse(readFileSync(join(ROOT, surface.contract), 'utf8'));
        const spec = (contract.states ?? []).find(
          (candidate: { name: string }) => candidate.name === state.name
        );
        if (!spec) throw new Error(`${surface.contract} describes no state "${state.name}"`);

        const elements: Measured[] = (spec.elements ?? []).map(
          (element: { name: string; web: { selector: string }; properties: string[] }) => ({
            name: element.name,
            selector: element.web.selector,
            properties: element.properties,
          })
        );

        await page.setViewportSize(VIEWPORT);
        await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });

        // Reaching the state is the routine's job, navigation included, so a state
        // that needs a session can sign in before the page is drawn.
        //
        // The wait is the capture region, not `networkidle`: this page holds a
        // development socket open, so `networkidle` settles long after the paint -
        // or never - and a state that arrives once the session lands was being
        // measured as the guest one.
        const regionSelector = spec.capture
          ? elements.find((element) => element.name === spec.capture)?.selector
          : null;
        // A state may name its own route (#967): the frame's two chromes are two
        // pages, a primary one and a drill-down, and the second is not `/`.
        const route = spec.route ?? surface.web.route;
        const visit = async (origin?: string) => {
          await page.goto(origin ? new URL(route, origin).toString() : route, {
            waitUntil: 'domcontentloaded',
          });
          if (regionSelector) {
            const region = page.locator(regionSelector).first();
            await region.waitFor({ timeout: 30_000 });
            // A capture region below the fold is measured before it is drawn: the
            // page's own `whileInView` leaves it translated until it enters the
            // viewport, so the recording has to scroll it in before the numbers are
            // taken. A region already in view is not moved.
            await region.scrollIntoViewIfNeeded();
          }
          // The card enters with a scale animation (`initial: scale(0.95)`), so the
          // first frame after it exists is a box five percent too small. Waiting for
          // the frame clock to settle is what makes the box the design's own size.
          await page.waitForTimeout(600);
          // The measurement is only the same measurement if the faces are the ones
          // both clients ship; a fallback font moves every box it draws.
          await page.evaluate(() => document.fonts.ready);
          await expect(page.locator('body')).toBeVisible();
        };

        // The state is reached the same way a person reaches it: the routine is
        // named by the contract, so a state nobody can record fails here rather
        // than recording the page at rest under another name. A surface-specific
        // routine wins, so one surface's seeded rows do not change another's.
        const key = `${surface.surface}/${state.name}`;
        const prepare = PREPARE[key] ?? PREPARE[state.name];
        if (!prepare) throw new Error(`no routine records the state "${state.name}"`);

        try {
          await prepare(page, visit);

          // Motion and a blinking caret would make two recordings of one page differ.
          await page.addStyleTag({
            content:
              '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
          });

          const measured = await measure(page, elements);
          for (const element of elements) {
            expect(
              measured[element.name],
              `${surface.surface}/${state.name}: ${element.name} (${element.selector})`
            ).toBeTruthy();
          }

          const dir = join(ROOT, 'e2e', '__visual__', surface.surface, state.name);
          mkdirSync(dir, { recursive: true });
          writeFileSync(
            join(dir, 'web.json'),
            `${JSON.stringify(
              {
                surface: surface.surface,
                state: state.name,
                route,
                viewport: { ...VIEWPORT, deviceScaleFactor: DEVICE_SCALE },
                elements: measured,
              },
              null,
              2
            )}\n`,
            'utf8'
          );

          // The raster compares the region both clients draw identically. The page's
          // frame and the app's are not the same height, so a viewport capture would
          // compare the site's chrome with the app's; the contract names the element.
          // A frame that declares `raster: "none"` records no image at all: its gate
          // entry's `why` says what the page's pixels are that the app cannot draw.
          const region = spec.capture
            ? elements.find((element) => element.name === spec.capture)
            : null;
          if (surface.raster === 'none') {
            // Nothing to capture: the layout numbers are the whole recording.
          } else if (region) {
            await page
              .locator(region.selector)
              .first()
              .screenshot({ path: join(dir, 'web.png'), animations: 'disabled', caret: 'hide' });
          } else {
            await page.screenshot({
              path: join(dir, 'web.png'),
              fullPage: false,
              animations: 'disabled',
              caret: 'hide',
            });
          }
        } finally {
          // A seed is removed even when the recording failed: the next run must
          // start from the same feed this one did.
          const cleanup = CLEANUP[key] ?? CLEANUP[state.name];
          if (cleanup) await cleanup(page);
        }
      });
    }
  }
});
