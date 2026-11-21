import { expect, test, type Page } from '@playwright/test';

/**
 * The gate for issue #1648: a search hint must clear AA against the surface it
 * is painted on. The measurement is the one the audit used — the computed
 * `::placeholder` colour, the element's composited background stack, 393 x 852
 * at DPR 2.75, dark, `ar` — so a utility that reintroduces an alpha cannot pass
 * by looking fine in a light theme or at a desktop width.
 */
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2.75,
  colorScheme: 'dark',
  locale: 'ar',
});

const SURFACES = [
  {
    name: 'community',
    url: '/community/explore',
    selector: '[data-visual="community-search"] [data-slot="search-field"]',
  },
  { name: 'quran', url: '/quran', selector: '[data-visual="quran-search"]' },
  { name: 'notes', url: '/?tab=/notes', selector: '[data-visual="notes-search"]' },
];

type Channels = [number, number, number, number];

async function measuredContrast(page: Page, selector: string) {
  return page.evaluate((selected) => {
    const input = document.querySelector(selected);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`no search field matches ${selected}`);
    }

    // Tailwind 4 serialises colours as `oklab()`; painting one pixel and reading
    // it back gives the sRGB channels (and the alpha) the browser actually drew.
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d canvas');
    const channels = (value: string): Channels => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return [red ?? 0, green ?? 0, blue ?? 0, (alpha ?? 255) / 255];
    };

    const hint = channels(getComputedStyle(input, '::placeholder').color);

    // Walk from the root to the input so each translucent background composites
    // over the one beneath it, the way the audit resolved the notes card.
    const ancestors: Element[] = [];
    for (let node: Element | null = input; node; node = node.parentElement) {
      ancestors.unshift(node);
    }
    let background: Channels = [0, 0, 0, 1];
    for (const element of ancestors) {
      const [red, green, blue, alpha] = channels(getComputedStyle(element).backgroundColor);
      if (alpha > 0) {
        background = [
          red * alpha + background[0] * (1 - alpha),
          green * alpha + background[1] * (1 - alpha),
          blue * alpha + background[2] * (1 - alpha),
          1,
        ];
      }
    }

    const foreground: Channels =
      hint[3] < 1
        ? [
            hint[0] * hint[3] + background[0] * (1 - hint[3]),
            hint[1] * hint[3] + background[1] * (1 - hint[3]),
            hint[2] * hint[3] + background[2] * (1 - hint[3]),
            1,
          ]
        : hint;

    const luminance = (color: Channels) => {
      const linear = (channel: number) => {
        const srgb = channel / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(color[0]) + 0.7152 * linear(color[1]) + 0.0722 * linear(color[2]);
    };
    const sorted = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    const light = sorted[0] ?? 0;
    const dark = sorted[1] ?? 0;

    return {
      ratio: (light + 0.05) / (dark + 0.05),
      hint: foreground.slice(0, 3),
      background: background.slice(0, 3),
    };
  }, selector);
}

for (const surface of SURFACES) {
  test(`the ${surface.name} search hint meets 4.5:1 against its own background`, async ({
    page,
  }) => {
    await page.goto(surface.url);
    const field = page.locator(surface.selector);
    await expect(field).toBeVisible();

    const measured = await measuredContrast(page, surface.selector);
    expect(measured.ratio, JSON.stringify(measured)).toBeGreaterThanOrEqual(4.5);
  });
}
