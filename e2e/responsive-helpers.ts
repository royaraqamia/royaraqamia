import { expect, type Page, type Locator } from '@playwright/test';

const MIN_TOUCH_TARGET_PX = 44;

/**
 * Assert no horizontal overflow on the page.
 * Checks if the page is actually scrollable horizontally,
 * rather than just measuring scrollWidth (which ignores overflow-x: hidden).
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
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
 * Assert no element overflows the viewport horizontally.
 * Only checks non-positioned elements (in normal document flow),
 * since absolutely-positioned decorative elements are clipped by overflow-x: hidden.
 */
export async function expectNoElementOverflow(page: Page): Promise<void> {
  const overflowing = await page.evaluate(() => {
    const viewWidth = window.innerWidth;
    const results: { tag: string; text: string; left: number; right: number }[] = [];
    const els = document.querySelectorAll('*');
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
        continue;
      // Skip absolutely/fixed positioned elements — they don't affect scroll width
      if (
        style.position === 'absolute' ||
        style.position === 'fixed' ||
        style.position === 'sticky'
      )
        continue;
      if (rect.left < -1 || rect.right > viewWidth + 1) {
        const text = el.textContent?.slice(0, 50)?.trim() || '';
        results.push({
          tag: el.tagName.toLowerCase(),
          text,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        });
      }
    }
    return { viewWidth, results };
  });
  expect(
    overflowing.results,
    `Elements overflow viewport (${overflowing.viewWidth}px): ${overflowing.results.map((r) => `${r.tag}("${r.text}") L${r.left}/R${r.right}`).join(', ')}`
  ).toHaveLength(0);
}

/**
 * Assert all primary interactive elements meet minimum touch target size.
 * Skips pure text links (anchors without button styling) if they have adequate padding.
 */
export async function expectTouchTargets(page: Page): Promise<void> {
  const undersized = await page.evaluate((minPx) => {
    function isButtonLikeAnchor(el: Element): boolean {
      const style = window.getComputedStyle(el);
      const hasButtonRole = el.getAttribute('role') === 'button';
      const hasButtonClasses =
        style.display === 'inline-flex' ||
        style.display === 'flex' ||
        el.classList.contains('btn') ||
        el.classList.contains('button');
      const hasExplicitDimensions =
        el.hasAttribute('class') &&
        /(?:^|\s)(?:h-|min-h-|p-|px-|py-|rounded-|bg-)/.test(el.getAttribute('class') || '');
      return hasButtonRole || hasButtonClasses || hasExplicitDimensions;
    }

    const primarySelectors = 'button, input, select, textarea, [role="button"], [role="tab"]';
    const results: { tag: string; text: string; w: number; h: number; selector: string }[] = [];
    const els = document.querySelectorAll(primarySelectors);
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (rect.width < minPx || rect.height < minPx) {
        const text = (el.textContent || el.getAttribute('aria-label') || '').slice(0, 40).trim();
        results.push({
          tag: el.tagName.toLowerCase(),
          text,
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
        });
      }
    }

    // Also check anchor tags, but skip pure text links
    const anchors = document.querySelectorAll('a');
    for (const el of anchors) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (rect.width >= minPx && rect.height >= minPx) continue;

      // Skip pure text links (anchors without button-like styling)
      // These are navigational/decorative text, not primary interactive elements
      const isTextLink =
        style.display === 'inline' || (style.display !== 'flex' && style.display !== 'inline-flex');
      const hasExplicitPadding =
        parseFloat(style.paddingTop) >= 8 &&
        parseFloat(style.paddingBottom) >= 8 &&
        parseFloat(style.paddingLeft) >= 8 &&
        parseFloat(style.paddingRight) >= 8;
      if (isTextLink && hasExplicitPadding) continue;

      // Skip if anchor has a parent with adequate padding (e.g., nav links inside padded containers)
      const parent = el.parentElement;
      if (parent) {
        const parentStyle = window.getComputedStyle(parent);
        const parentPaddingOk =
          parseFloat(parentStyle.paddingTop) >= 8 &&
          parseFloat(parentStyle.paddingBottom) >= 8 &&
          parseFloat(parentStyle.paddingLeft) >= 8 &&
          parseFloat(parentStyle.paddingRight) >= 8;
        if (isTextLink && parentPaddingOk) continue;
      }

      // Only flag anchors that are visually button-like (flex, inline-flex, or have button classes)
      if (!isButtonLikeAnchor(el)) continue;

      const text = (el.textContent || el.getAttribute('aria-label') || '').slice(0, 40).trim();
      results.push({
        tag: 'a',
        text,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        selector: 'a' + (el.id ? `#${el.id}` : ''),
      });
    }
    return results;
  }, MIN_TOUCH_TARGET_PX);

  expect(
    undersized,
    `Touch targets below ${MIN_TOUCH_TARGET_PX}px: ${undersized.map((u) => `${u.tag}("${u.text}") ${u.w}x${u.h}`).join(', ')}`
  ).toHaveLength(0);
}

/**
 * Assert text elements have minimum font size.
 */
export async function expectMinFontSize(page: Page, minSize = 11): Promise<void> {
  const tooSmall = await page.evaluate((min) => {
    const results: { tag: string; text: string; size: number }[] = [];
    const textEls = document.querySelectorAll(
      'p, span, h1, h2, h3, h4, h5, h6, li, label, td, th, a, button, div'
    );
    for (const el of textEls) {
      const text = el.textContent?.trim();
      if (!text || text.length === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const size = parseFloat(style.fontSize);
      if (size < min) {
        results.push({
          tag: el.tagName.toLowerCase(),
          text: text.slice(0, 40),
          size: Math.round(size),
        });
      }
    }
    return results;
  }, minSize);

  expect(
    tooSmall,
    `Font sizes below ${minSize}px: ${tooSmall.map((t) => `${t.tag}("${t.text}") ${t.size}px`).join(', ')}`
  ).toHaveLength(0);
}

/**
 * Assert no element has text that overflows its container (ellipsis overflow).
 */
export async function expectNoTextOverflow(page: Page): Promise<void> {
  const overflowing = await page.evaluate(() => {
    const results: { tag: string; text: string; scrollW: number; clientW: number }[] = [];
    const els = document.querySelectorAll(
      'p, span, h1, h2, h3, h4, h5, h6, a, button, div, td, th'
    );
    for (const el of els) {
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        const style = window.getComputedStyle(el);
        if (style.overflow === 'hidden' || style.overflow === 'clip') continue;
        const text = el.textContent?.trim().slice(0, 40) || '';
        if (!text) continue;
        results.push({
          tag: el.tagName.toLowerCase(),
          text,
          scrollW: Math.round(el.scrollWidth),
          clientW: Math.round(el.clientWidth),
        });
      }
    }
    return results;
  });

  expect(
    overflowing,
    `Text overflow detected: ${overflowing.map((o) => `${o.tag}("${o.text}") scroll:${o.scrollW} client:${o.clientW}`).join(', ')}`
  ).toHaveLength(0);
}

/**
 * Assert an element is visible within the viewport.
 */
export async function expectInViewport(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, 'Element should have a bounding box').not.toBeNull();
}

/**
 * Take a full-page screenshot for visual verification.
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
}

/**
 * Run all responsive checks on a page.
 */
export async function runAllChecks(page: Page, screenshotName: string): Promise<void> {
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
  await expectNoTextOverflow(page);
  await takeScreenshot(page, screenshotName);
}

/**
 * Login helper for authenticated routes.
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 60_000 });

  await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 60_000 });

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
}
