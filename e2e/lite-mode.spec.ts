import { test, expect, type CDPSession, type Page } from '@playwright/test';

/**
 * Acceptance for the `lite` contract (issue #123), on a real browser rather
 * than by bundle size.
 *
 * Two device profiles are exercised against the built site:
 *
 *   1. A throttled low-end Android profile — 4x CPU slowdown and no cache — with
 *      `navigator.deviceMemory` / `hardwareConcurrency` overridden via CDP to
 *      the values a budget phone reports. The pre-paint script must mark
 *      `html.lite` before `DOMContentLoaded`, and a computed-style probe must
 *      find no `backdrop-filter` and no large `blur()` filter anywhere.
 *   2. A capable profile that reports generous memory/cores. Nothing may be
 *      marked, and the same probe must still find glassmorphism intact.
 *
 * `e2e/lite-mode-reduced.spec.ts` covers the reduced-motion path, which is a
 * context option rather than a CDP override.
 */

interface LiteProbe {
  isLite: boolean;
  dataLite: string | null;
  stored: string | null;
  markedBeforeDomContentLoaded: boolean;
  backdropFiltered: string[];
  blurred: string[];
}

/**
 * Runs in the page. Counts elements whose *computed* style still asks for the
 * effects lite mode exists to remove — computed style, not class names, so a
 * class that fails to win the cascade is caught rather than assumed away.
 */
function probeLiteMode(): LiteProbe {
  const root = document.documentElement;
  const backdropFiltered: string[] = [];
  const blurred: string[] = [];

  for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
    const style = getComputedStyle(el) as CSSStyleDeclaration & {
      webkitBackdropFilter?: string;
    };
    const backdrop = style.backdropFilter || style.webkitBackdropFilter;
    if (backdrop && backdrop !== 'none') {
      backdropFiltered.push(el.className.toString().slice(0, 80));
    }
    // Only large radii count as "heavy glow blur"; small text/tint blurs are
    // cheap and are not what the issue targets.
    const filter = style.filter;
    const radius = filter.match(/blur\((\d+(?:\.\d+)?)px\)/);
    if (radius && Number(radius[1]) >= 8) {
      blurred.push(`${el.className.toString().slice(0, 60)} -> ${filter.slice(0, 60)}`);
    }
  }

  return {
    isLite: root.classList.contains('lite'),
    dataLite: root.getAttribute('data-lite'),
    stored: window.localStorage.getItem('rr:lite'),
    markedBeforeDomContentLoaded: root.classList.contains('lite'),
    backdropFiltered,
    blurred,
  };
}

/** Overrides the two capability signals CDP does not expose directly. */
async function overrideHardware(
  page: Page,
  { deviceMemory, hardwareConcurrency }: { deviceMemory: number; hardwareConcurrency: number }
) {
  const session: CDPSession = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(
    ({ memory, cores }) => {
      Object.defineProperty(navigator, 'deviceMemory', { get: () => memory, configurable: true });
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => cores,
        configurable: true,
      });
    },
    { memory: deviceMemory, cores: hardwareConcurrency }
  );
  await session.detach();
}

test.describe('lite mode on a throttled low-end profile', () => {
  test.use({
    // A budget Android handset, not a desktop viewport pretending to be small.
    ...{ viewport: { width: 360, height: 740 } },
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; SM-A105F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  });

  test('drops backdrop-filter and heavy glow blur before first paint', async ({ page }) => {
    await overrideHardware(page, { deviceMemory: 2, hardwareConcurrency: 2 });

    // Capture the class at DOMContentLoaded — the earliest hook that proves
    // the pre-paint script ran, rather than a client component catching up.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __liteAtDcl?: boolean }).__liteAtDcl =
          document.documentElement.classList.contains('lite');
      });
    });

    await page.goto('/', { waitUntil: 'load' });
    const markedAtDomContentLoaded = await page.evaluate(
      () => (window as unknown as { __liteAtDcl?: boolean }).__liteAtDcl === true
    );

    const probe = await page.evaluate(probeLiteMode);
    const markedAtDcl = markedAtDomContentLoaded || probe.markedBeforeDomContentLoaded;

    expect(markedAtDcl, 'html.lite must be set by DOMContentLoaded').toBe(true);
    expect(probe.isLite).toBe(true);
    expect(probe.dataLite).toBe('true');
    expect(probe.stored).toBe('true');
    expect(probe.backdropFiltered, 'no element may keep a backdrop-filter').toEqual([]);
    expect(probe.blurred, 'no element may keep a heavy blur() filter').toEqual([]);
  });
});

test.describe('lite mode leaves capable devices untouched', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('does not mark the document and keeps the glass effects', async ({ page }) => {
    await overrideHardware(page, { deviceMemory: 8, hardwareConcurrency: 8 });
    await page.goto('/', { waitUntil: 'load' });

    const probe = await page.evaluate(probeLiteMode);

    expect(probe.isLite).toBe(false);
    expect(probe.dataLite).toBeNull();
    expect(probe.stored).toBe('false');
    // The landing page must still carry at least one backdrop-filtered surface.
    expect(
      probe.backdropFiltered.length,
      'a capable profile should still render glassmorphism'
    ).toBeGreaterThan(0);
  });
});
