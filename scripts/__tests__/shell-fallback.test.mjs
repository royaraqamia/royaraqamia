import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as acorn from 'acorn';

/**
 * The local page Capacitor shows when the site cannot be reached, or when the
 * installed System WebView is below the floor (ADR-0067).
 *
 * It is a hand-written HTML file in `capacitor-web/`, a config value in
 * `capacitor.config.ts`, and two font files copied from `public/fonts/`; nothing
 * at build time connects them. A moved page, a floor that drifts from the
 * config, or a "fix" written in the site's modern syntax would all look fine in
 * a browser and fail exactly where this page is meant to work — on an old,
 * offline WebView. So the agreement is pinned here.
 */

const config = readFileSync('capacitor.config.ts', 'utf8');
const html = readFileSync('capacitor-web/unavailable.html', 'utf8');

const errorPath = config.match(/errorPath:\s*'([^']+)'/)?.[1];
const configuredFloor = Number(config.match(/minWebViewVersion:\s*(\d+)/)?.[1]);
const pageFloor = Number(html.match(/MINIMUM_WEBVIEW = (\d+)/)?.[1]);
const pageScript = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? '';
/** Source wrapping and rendered whitespace are not the same string. */
const pageText = html.replace(/\s+/g, ' ');

describe('the shell fallback page', () => {
  it('is the page the Capacitor config names, inside the bundled webDir', () => {
    expect(errorPath).toBe('unavailable.html');
    expect(config).toContain("webDir: 'capacitor-web'");
    expect(existsSync(`capacitor-web/${errorPath}`)).toBe(true);
  });

  it('uses one WebView floor in the config and in the page', () => {
    expect(configuredFloor).toBeGreaterThanOrEqual(55);
    expect(pageFloor).toBe(configuredFloor);
    // The static copy is what a no-JS render shows; the script rewrites it from
    // the constant above, so the two cannot disagree after the check above.
    expect(html).toContain(`<span id="required">${configuredFloor}</span>`);
  });

  it('parses as ES5, because the page is shown when the WebView is old', () => {
    expect(pageScript.trim().length).toBeGreaterThan(0);
    expect(() => acorn.parse(pageScript, { ecmaVersion: 5, sourceType: 'script' })).not.toThrow();
    // Acorn would accept `class` with a later version; this page must not rely
    // on the site's own ES2022 baseline (class fields / static blocks), which is
    // exactly what WebView 83 fails on.
    expect(pageScript).not.toMatch(/\bclass\s|=>|\bconst\b|\blet\b|\?\.|\?\?/);
  });

  it('selects the copy from the WebView version in its own user agent', () => {
    expect(pageScript).toContain('/Chrome\\/(\\d+)/');
    expect(pageScript).toContain('current < MINIMUM_WEBVIEW');
    expect(pageText).toContain('يلزم تحديث عرض النظام');
    expect(pageText).toContain('Android System WebView');
    expect(pageText).toContain('تعذَّر فتح الموقع');
  });

  it('retries with a real link to the canonical origin, and nothing automatic', () => {
    const retries = html.match(/href="https:\/\/royaraqamia\.com"/g) ?? [];
    expect(retries.length).toBeGreaterThanOrEqual(2); // the button and <noscript>
    expect(html).toContain('>إعادة المحاولة</a>');

    // No timer, online listener or location write: a site that stays down must
    // produce this page once per attempt, never a reload loop.
    for (const automatic of [
      'setTimeout',
      'setInterval',
      'location.reload',
      'location.replace',
      'location.href',
      'window.open',
      "addEventListener('online'",
    ]) {
      expect(pageScript).not.toContain(automatic);
    }
  });

  it('is readable at 320px and does not fetch anything from the network', () => {
    expect(html).toContain('width=device-width, initial-scale=1');
    expect(html).toContain('max-width: 420px');
    expect(html).toContain('max-width: 360px');
    expect(html).toContain('box-sizing: border-box');

    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toContain('url(http');
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('carries the same font bytes the site ships', () => {
    for (const name of ['IBMPlexSansArabic-Regular.woff2', 'IBMPlexSansArabic-Bold.woff2']) {
      expect(readFileSync(`capacitor-web/fonts/${name}`)).toEqual(
        readFileSync(`public/fonts/IBM Plex Sans Arabic/${name}`)
      );
      expect(html).toContain(`url('fonts/${name}')`);
    }
  });
});
