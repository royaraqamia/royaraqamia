import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

/**
 * What the generated tokens render as (ADR-0096, #666).
 *
 * `npm run check:tokens` proves the committed stylesheets and the app's theme
 * are the generator's own output. It cannot prove that a browser resolves that
 * output to the design the tokens were transcribed from: a `clamp()` written one
 * stop off, an HSL triplet transposed, or a face whose `unicode-range` stopped
 * catching the numerals all leave the stylesheet byte-identical to what the
 * generator produces, and all change what a reader sees.
 *
 * So this reads the resolution back — every generated custom property, resolved
 * by the browser at one viewport, plus one real surface wearing them — and
 * compares it with a committed baseline. It is a baseline of values rather than
 * of pixels on purpose: text rasterises differently on every platform, so a
 * picture recorded on Linux CI could not be re-recorded on a developer's Windows
 * machine, and a baseline nobody can regenerate locally is one that gets
 * rubber-stamped.
 *
 * Re-record with `npm run visual:baseline`, and read the diff of
 * `e2e/visual-baseline.json` before committing it.
 */
const BASELINE = path.join(process.cwd(), 'e2e', 'visual-baseline.json');
const TOKENS_CSS = path.join(process.cwd(), 'app', 'tokens.css');
const UPDATE = process.env.VISUAL_BASELINE === 'update';

/**
 * The sura index: static, public, and drawn from the shared tokens — the surface
 * ladder and radii on the rows, the heading face on the numerals, the digits
 * face on everything else (ADR-0057).
 */
const SURFACE = '/quran';

/** A token under test: a value, and the property that resolves it. */
type Probe = {
  /** The custom property, as `app/tokens.css` declares it. */
  name: string;
  property: string;
  value: string;
  /** For a length in `em`, the font size the property resolves against. */
  fontSize?: string;
};

/**
 * The declarations inside the generated `:root` block. Reading them from the
 * committed file rather than restating them here is what makes a new token
 * covered the moment it is generated — and an unrecognised one fail loudly,
 * rather than silently going unwatched.
 */
function declaredTokens(): Map<string, string> {
  const css = readFileSync(TOKENS_CSS, 'utf8');
  const start = css.indexOf(':root {');
  if (start === -1) {
    throw new Error('app/tokens.css has no ":root" block');
  }
  const declarations = new Map<string, string>();
  for (const line of css.slice(start).split('\n')) {
    if (line.trim() === '}') {
      break;
    }
    const declaration = /^\s*(--[a-z0-9-]+):\s*(.+);$/.exec(line);
    const [, name, value] = declaration ?? [];
    if (name && value) {
      declarations.set(name, value.trim());
    }
  }
  return declarations;
}

/**
 * Which property a token is read through. The categories are the design
 * system's own, and each is named by the token's shape, so a token that belongs
 * to none of them stops the run instead of being skipped.
 */
export function probeFor(name: string, declared: string): Probe {
  const typeStep = /^--type-(.+)-size$/.exec(name);
  if (typeStep) {
    return { name, property: 'font-size', value: `var(${name})` };
  }
  if (/^--type-.+-weight$/.test(name)) {
    return { name, property: 'font-weight', value: `var(${name})` };
  }
  const leading = /^--type-(.+)-leading$/.exec(name);
  if (leading) {
    // Leading and tracking are relative to their step's size, so they are read
    // against it rather than against the probe's default.
    return {
      name,
      property: 'line-height',
      value: `var(${name})`,
      fontSize: `var(--type-${leading[1]}-size)`,
    };
  }
  const tracking = /^--type-(.+)-tracking$/.exec(name);
  if (tracking) {
    // Tracking is in `em`, so it only means something against its own step.
    return {
      name,
      property: 'letter-spacing',
      value: `var(${name})`,
      fontSize: `var(--type-${tracking[1]}-size)`,
    };
  }
  if (name === '--radius') {
    return { name, property: 'border-top-left-radius', value: `var(${name})` };
  }
  if (/^--family-/.test(name)) {
    return { name, property: 'font-family', value: `var(${name})` };
  }
  if (/^--shadow-/.test(name)) {
    return { name, property: 'box-shadow', value: `var(${name})` };
  }
  if (/^--duration-/.test(name)) {
    return { name, property: 'transition-duration', value: `var(${name})` };
  }
  if (/^--ease-/.test(name)) {
    return { name, property: 'transition-timing-function', value: `var(${name})` };
  }
  if (/^clamp\(/.test(declared)) {
    return { name, property: 'padding-top', value: `var(${name})` };
  }
  if (/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/.test(declared)) {
    // HSL components are composed by their consumer, the way Tailwind does.
    return { name, property: 'color', value: `hsl(var(${name}))` };
  }
  throw new Error(`no probe for ${name}: ${declared}`);
}

/**
 * The properties each element of the surface is read for. Element and property
 * names are part of the baseline, so renaming one is a deliberate re-record.
 */
const SURFACE_ELEMENTS = [
  {
    label: 'page',
    selector: 'body',
    properties: ['color', 'background-color', 'font-family', 'font-size', 'line-height'],
  },
  {
    label: 'title',
    selector: 'h1',
    properties: [
      'color',
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
    ],
  },
  {
    label: 'search',
    selector: 'input[type="text"]',
    properties: [
      'height',
      'background-color',
      'border-top-color',
      'border-top-width',
      'border-top-left-radius',
      'padding-inline-start',
      'padding-inline-end',
      'font-size',
    ],
  },
  {
    label: 'row',
    selector: 'nav[aria-label] a',
    properties: [
      'height',
      'gap',
      'padding-top',
      'padding-inline-start',
      'background-color',
      'border-top-color',
      'border-top-width',
      'border-top-left-radius',
    ],
  },
  {
    label: 'row-number',
    selector: 'nav[aria-label] a > span:first-child',
    properties: [
      'width',
      'height',
      'background-color',
      'border-top-left-radius',
      'color',
      'font-family',
      'font-size',
      'font-weight',
    ],
  },
  {
    label: 'row-name',
    selector: 'nav[aria-label] a > span:nth-child(2) > span:first-child',
    properties: ['color', 'font-family', 'font-size', 'font-weight'],
  },
  {
    label: 'row-meta',
    selector: 'nav[aria-label] a > span:nth-child(2) > span:nth-child(2)',
    properties: ['color', 'font-family', 'font-size', 'line-height'],
  },
] as const;

type Capture = {
  surface: string;
  viewport: string;
  tokens: Record<string, string>;
  elements: Record<string, Record<string, string>>;
};

async function capture(page: Page): Promise<Capture> {
  const viewport = page.viewportSize();
  const tokens = declaredTokens();
  const probes = [...tokens].map(([name, declared]) => probeFor(name, declared));

  const resolved = await page.evaluate((pending) => {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(host);

    const values: Record<string, string> = {};
    for (const { name, property, value, fontSize } of pending) {
      const element = document.createElement('span');
      element.style.fontSize = fontSize ?? '16px';
      element.style.setProperty(property, value);
      host.appendChild(element);
      values[name] = getComputedStyle(element).getPropertyValue(property).trim();
    }

    host.remove();
    return values;
  }, probes);

  const elements = await page.evaluate(
    (specs) => {
      const captured: Record<string, Record<string, string>> = {};
      for (const { label, selector, properties } of specs) {
        const element = document.querySelector(selector);
        if (!element) {
          // A selector the surface no longer has means the baseline no longer
          // describes it: say which one, rather than passing on an empty record.
          captured[label] = { 'missing-element': selector };
          continue;
        }
        const style = getComputedStyle(element);
        const values: Record<string, string> = {};
        for (const property of properties) {
          values[property] = style.getPropertyValue(property).trim();
        }
        captured[label] = values;
      }
      return captured;
    },
    SURFACE_ELEMENTS.map(({ label, selector, properties }) => ({
      label,
      selector,
      properties: [...properties],
    }))
  );

  return {
    surface: SURFACE,
    viewport: viewport ? `${viewport.width}x${viewport.height}` : 'default',
    tokens: resolved,
    elements,
  };
}

test.describe('the tokens, as the browser resolves them', () => {
  // Recorded at one size, so the fluid `clamp()`s resolve to the same pixels on
  // every machine whatever the project's own viewport is.
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the sura index resolves the values the baseline records', async ({ page }) => {
    await page.goto(SURFACE);
    await page.evaluate(() => document.fonts.ready);

    const captured = await capture(page);

    if (UPDATE) {
      writeFileSync(BASELINE, `${JSON.stringify(captured, null, 2)}\n`, 'utf8');
      return;
    }

    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Capture;
    expect(captured).toEqual(baseline);
  });

  test('numerals are drawn in the digits face', async ({ page }) => {
    await page.goto(SURFACE);
    await page.evaluate(() => document.fonts.ready);

    // The digits face comes first in the body stack (`app/theme.css`); its
    // `unicode-range` is what keeps it off the letters around the numerals.
    const stack = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(stack).toMatch(/^["']?Aref Ruqaa Digits["']?/);

    const ranges = await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((face) => face.family.includes('Aref Ruqaa Digits'))
        .map((face) => face.unicodeRange)
    );
    expect(ranges).toEqual(['U+30-39']);

    // Applied to the digits on the page, so the file itself was fetched.
    const loaded = await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((face) => face.family.includes('Aref Ruqaa Digits'))
        .every((face) => face.status === 'loaded')
    );
    expect(loaded).toBe(true);
  });
});
