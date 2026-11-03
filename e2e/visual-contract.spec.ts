import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

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
 * Run it with `npm run visual:capture` (which selects this project), never by
 * hand: the viewport, DPR and locale are the measurement.
 */

const gate = JSON.parse(readFileSync(GATE, 'utf8'));
const surfaces = gate.surfaces ?? [];

/** The app's phone: 393 x 852 CSS px at DPR 2.75, dark, Arabic, RTL. */
const VIEWPORT = { width: 393, height: 852 };
const DEVICE_SCALE = 2.75;

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
 * What a state does to the page before it is measured.
 *
 * A state is not a second page: it is the same route with something open, a
 * selection made, or a session behind it. Each routine is named by the contract,
 * so a state with no routine fails by name instead of silently recording the page
 * at rest under another state's name.
 */
const PREPARE: Record<string, (page: Page, spec: { name: string }) => Promise<void>> = {
  'at-rest': async () => {},
};

test.describe('the visual gate', () => {
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
        await page.goto(surface.web.route, { waitUntil: 'networkidle' });

        // The measurement is only the same measurement if the faces are the ones
        // both clients ship; a fallback font moves every box it draws.
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('body')).toBeVisible();

        // Motion and a blinking caret would make two recordings of one page differ.
        await page.addStyleTag({
          content:
            '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
        });

        // The state is reached the same way a person reaches it: the routine is
        // named by the contract, so a state nobody can record fails here rather
        // than recording the page at rest under another name.
        const prepare = PREPARE[state.name];
        if (!prepare) throw new Error(`no routine records the state "${state.name}"`);
        await prepare(page, spec);

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
        const region = spec.capture
          ? elements.find((element) => element.name === spec.capture)
          : null;
        if (region) {
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
      });
    }
  }
});
