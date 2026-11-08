import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect, type BrowserContext, type Page } from '@playwright/test';

import {
  clearVisualCommunityPosts,
  clearVisualLink,
  COMMUNITY_SEED_PREFIX,
  protectVisualLink,
  seedVisualLink,
  signInAsVisualAccount,
  VISUAL_ACCOUNT_MISSING,
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
};

/** What a state removes after its recording, so a seed is never left behind. */
const CLEANUP: Record<string, (page: Page) => Promise<void>> = {
  'linksnap/signed-in': async (page) => {
    await clearVisualLink(page.context(), projectBaseURL());
  },
  'account-links/at-rest': async (page) => {
    await clearVisualLink(page.context(), projectBaseURL());
  },
  'account-links/bulk-bar': async (page) => {
    await clearVisualLink(page.context(), projectBaseURL());
  },
  'community/at-rest': async (page) => {
    await clearVisualCommunityPosts(page.context(), projectBaseURL());
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
        const visit = async (origin?: string) => {
          await page.goto(
            origin ? new URL(surface.web.route, origin).toString() : surface.web.route,
            {
              waitUntil: 'domcontentloaded',
            }
          );
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
                route: surface.web.route,
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
