import { expect, test, type Page } from '@playwright/test';

/**
 * The gate for issue #1669: a filled control's label must clear AA against the
 * fill it is painted on. The measurement is the one the audit used — the
 * computed `color` and the composited background of every filled control, at
 * 393 x 852 and DPR 2.75, dark, `ar` — so a class that reintroduces the light
 * `--primary` fill cannot pass by looking fine at a desktop width.
 */
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2.75,
  colorScheme: 'dark',
  locale: 'ar',
});

const SURFACES = ['/quran/999', '/security', '/auth/error'];

type Channels = [number, number, number, number];

type Measurement = {
  element: string;
  label: string;
  ratio: number;
  ink: number[];
  fill: number[];
};

async function measure(page: Page): Promise<Measurement[]> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d canvas');

    // Tailwind 4 serialises colours as `oklab()`; painting one pixel and reading
    // it back gives the sRGB channels the browser actually drew.
    const channels = (value: string): Channels => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return [red ?? 0, green ?? 0, blue ?? 0, (alpha ?? 255) / 255];
    };

    const over = (top: Channels, bottom: Channels): Channels => [
      top[0] * top[3] + bottom[0] * (1 - top[3]),
      top[1] * top[3] + bottom[1] * (1 - top[3]),
      top[2] * top[3] + bottom[2] * (1 - top[3]),
      1,
    ];

    const luminance = ([red, green, blue]: Channels) => {
      const linear = (channel: number) => {
        const srgb = channel / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    };

    const ratio = (a: Channels, b: Channels) => {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };

    // Walk from the root so each translucent surface composites over the one
    // beneath it, the way the audit resolved a fill sitting on a card.
    const surfaceUnder = (element: Element): Channels => {
      const ancestors: Element[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        ancestors.unshift(node);
      }
      let surface: Channels = [0, 0, 0, 1];
      for (const node of ancestors) {
        const background = channels(getComputedStyle(node).backgroundColor);
        if (background[3] > 0) surface = over(background, surface);
      }
      return surface;
    };

    const candidates = new Set<Element>();
    for (const selector of ['[data-slot="button"]', 'a', 'button', '[class*="bg-selected"]']) {
      for (const element of document.querySelectorAll(selector)) candidates.add(element);
    }

    const results: Measurement[] = [];
    for (const element of candidates) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.getClientRects().length === 0) continue;
      const label = (element.textContent ?? '').trim();
      if (label.length === 0) continue;

      const style = getComputedStyle(element);
      const fills: Channels[] = [];
      const background = channels(style.backgroundColor);
      if (background[3] > 0) fills.push(background);
      if (style.backgroundImage !== 'none') {
        const stops = style.backgroundImage.match(
          /\b(?:rgba?|hsla?|oklab|oklch|lab|lch|color)\([^)]*\)/gi
        );
        for (const stop of stops ?? []) {
          const channel = channels(stop);
          if (channel[3] > 0) fills.push(channel);
        }
      }
      if (fills.length === 0) continue;

      const surface = surfaceUnder(element);
      for (const raw of fills) {
        const fill = raw[3] < 1 ? over(raw, surface) : raw;
        const rawInk = channels(style.color);
        const ink = rawInk[3] < 1 ? over(rawInk, fill) : rawInk;
        results.push({
          element: element.tagName.toLowerCase(),
          label: label.slice(0, 48),
          ratio: ratio(ink, fill),
          ink: ink.slice(0, 3),
          fill: fill.slice(0, 3),
        });
      }
    }
    return results;
  });
}

for (const url of SURFACES) {
  test(`every filled control on ${url} carries its label at 4.5:1`, async ({ page }) => {
    await page.goto(url);
    const measured = await measure(page);
    expect(measured.length, `${url}: no filled controls were measured`).toBeGreaterThan(0);

    const failures = measured.filter((item) => item.ratio < 4.5);
    expect(failures, `${url}: ${JSON.stringify(failures)}`).toHaveLength(0);
  });
}
