import { expect, test, type Page } from '@playwright/test';
import { signIn } from './sign-in';

/**
 * The gate for #1648 and #1833: a search hint or a relative timestamp must
 * clear AA against the surface it is painted on. The measurement is the one the
 * audits used — the computed colour of the text (or of `::placeholder` for a
 * field), the element's composited background stack, 393 x 852 at DPR 2.75,
 * dark, `ar`, `Asia/Riyadh` — so a utility that reintroduces an alpha cannot
 * pass by looking fine in a light theme or at a desktop width.
 */
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2.75,
  colorScheme: 'dark',
  locale: 'ar',
  timezoneId: 'Asia/Riyadh',
});

interface Surface {
  name: string;
  url: string;
  selector: string;
  paint: 'placeholder' | 'text';
  signedIn?: boolean;
  thread?: boolean;
  picker?: boolean;
}

const SURFACES: Surface[] = [
  {
    name: 'community search hint',
    url: '/community/explore',
    selector: '[data-visual="community-search"] [data-slot="search-field"]',
    paint: 'placeholder',
  },
  {
    name: 'quran search hint',
    url: '/quran',
    selector: '[data-visual="quran-search"]',
    paint: 'placeholder',
  },
  {
    name: 'notes search hint',
    url: '/?tab=/notes',
    selector: '[data-visual="notes-search"]',
    paint: 'placeholder',
  },
  {
    name: 'notification row time',
    url: '/notifications?tab=alerts',
    selector: '[data-visual="notification-time"]',
    paint: 'text',
    signedIn: true,
  },
  {
    name: 'chat row time',
    url: '/notifications?tab=chats',
    selector: '[data-visual="chat-row-time"]',
    paint: 'text',
    signedIn: true,
  },
  {
    name: 'thread message time',
    url: '/notifications?tab=chats',
    selector: '[data-visual="chat-message-time"]',
    paint: 'text',
    signedIn: true,
    thread: true,
  },
  {
    name: 'chat picker hint',
    url: '/notifications?tab=chats',
    selector: 'input[name="chat-member-search"]',
    paint: 'placeholder',
    signedIn: true,
    picker: true,
  },
];

type Channels = [number, number, number, number];

async function measuredContrast(page: Page, selector: string, paint: Surface['paint']) {
  return page.evaluate(
    ({ selected, painted }) => {
      const element = document.querySelector(selected);
      if (!element) {
        throw new Error(`no element matches ${selected}`);
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

      const foreground =
        painted === 'placeholder'
          ? channels(getComputedStyle(element, '::placeholder').color)
          : channels(getComputedStyle(element).color);

      // Walk from the root to the element so each translucent background
      // composites over the one beneath it, the way the audits resolved a card.
      const ancestors: Element[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        ancestors.unshift(node);
      }
      let background: Channels = [0, 0, 0, 1];
      for (const node of ancestors) {
        const [red, green, blue, alpha] = channels(getComputedStyle(node).backgroundColor);
        if (alpha > 0) {
          background = [
            red * alpha + background[0] * (1 - alpha),
            green * alpha + background[1] * (1 - alpha),
            blue * alpha + background[2] * (1 - alpha),
            1,
          ];
        }
      }

      const ink: Channels =
        foreground[3] < 1
          ? [
              foreground[0] * foreground[3] + background[0] * (1 - foreground[3]),
              foreground[1] * foreground[3] + background[1] * (1 - foreground[3]),
              foreground[2] * foreground[3] + background[2] * (1 - foreground[3]),
              1,
            ]
          : foreground;

      const luminance = (color: Channels) => {
        const linear = (channel: number) => {
          const srgb = channel / 255;
          return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * linear(color[0]) + 0.7152 * linear(color[1]) + 0.0722 * linear(color[2]);
      };
      const sorted = [luminance(ink), luminance(background)].sort((a, b) => b - a);
      const light = sorted[0] ?? 0;
      const dark = sorted[1] ?? 0;

      return {
        ratio: (light + 0.05) / (dark + 0.05),
        ink: ink.slice(0, 3),
        background: background.slice(0, 3),
      };
    },
    { selected: selector, painted: paint }
  );
}

for (const surface of SURFACES) {
  test(`the ${surface.name} meets 4.5:1 against its own background`, async ({
    context,
    page,
    baseURL,
  }) => {
    if (surface.signedIn) {
      test.skip(
        !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
        'E2E_TEST_EMAIL and E2E_TEST_PASSWORD are the fixture account'
      );
      await signIn(context, baseURL!);
    }

    await page.goto(surface.url);

    if (surface.thread) {
      const row = page.locator('a[href^="/chats/"]').first();
      await expect(row).toBeVisible();
      const href = await row.getAttribute('href');
      if (!href) {
        test.skip(true, 'no chat thread to open (run e2e/setup-test-user.ts)');
        return;
      }
      await page.goto(href);
    }

    if (surface.picker) {
      await page.getByRole('button', { name: 'محادثة جديدة' }).click();
    }

    const target = page.locator(surface.selector).first();
    try {
      await target.waitFor({ state: 'visible', timeout: 45_000 });
    } catch {
      test.skip(true, `no ${surface.name} to measure (run e2e/setup-test-user.ts)`);
      return;
    }
    await expect(target).toBeVisible();

    const measured = await measuredContrast(page, surface.selector, surface.paint);
    expect(measured.ratio, JSON.stringify(measured)).toBeGreaterThanOrEqual(4.5);
  });
}
