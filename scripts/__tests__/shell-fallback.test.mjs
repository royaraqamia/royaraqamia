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
 * offline WebView. So the agreement is pinned here. Since #447 the page also
 * owns ADR-0067's recovery amendment: one reload, on the first `online` event,
 * guarded by a session flag — and this test pins the guard, not just the copy.
 */

const config = readFileSync('capacitor.config.ts', 'utf8');
const html = readFileSync('capacitor-web/unavailable.html', 'utf8');

const errorPath = config.match(/errorPath:\s*'([^']+)'/)?.[1];
const configuredFloor = Number(config.match(/minWebViewVersion:\s*(\d+)/)?.[1]);
const pageFloor = Number(html.match(/MINIMUM_WEBVIEW = (\d+)/)?.[1]);
/** The one inline script, taken by offsets rather than an HTML-filtering regexp. */
function inlineScript(source) {
  const open = source.toLowerCase().indexOf('<script');
  if (open < 0) return '';
  const body = source.indexOf('>', open);
  if (body < 0) return '';
  const close = source.toLowerCase().indexOf('</script', body + 1);
  return close < 0 ? '' : source.slice(body + 1, close);
}

const pageScript = inlineScript(html);
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

  it('retries with a real link, and reloads once on reconnect behind a session guard', () => {
    const retries = html.match(/href="https:\/\/royaraqamia\.com"/g) ?? [];
    expect(retries.length).toBeGreaterThanOrEqual(2); // the button and <noscript>
    expect(html).toContain('>إعادة المحاولة</a>');

    // No timer ever: the radio coming back — not a clock — is the only
    // automatic trigger, and a reload never treats a still-down site as a
    // reason to try again (one failure stays one page load, ADR-0067).
    for (const automatic of [
      'setTimeout',
      'setInterval',
      'location.reload',
      'location.replace',
      'location.href',
      'window.open',
    ]) {
      expect(pageScript).not.toContain(automatic);
    }

    // The one-shot recovery (#447): exactly one `online` listener, on the
    // reachability copy only, guarded by a sessionStorage flag that the page
    // after the first reload reads and refuses to re-arm.
    expect((pageScript.match(/addEventListener\('online'/g) ?? []).length).toBe(1);
    expect(pageScript).toContain('RECOVERY_FLAG');
    expect(pageScript).toContain("sessionStorage.setItem(RECOVERY_FLAG, '1')");
    expect(pageScript).toContain('sessionStorage.getItem(RECOVERY_FLAG) !== null');
    expect(pageScript).toContain("removeEventListener('online'");
    expect(pageScript).toContain('var outdated = current > 0 && current < MINIMUM_WEBVIEW;');
    const recovery = pageScript.slice(pageScript.indexOf('function recoverOnce()'));
    expect(recovery).toContain("window.location.assign('https://royaraqamia.com')");
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

  it('sets the WebView version numbers in the brand digit face', () => {
    expect(html).toContain("font-family: 'Aref Ruqaa Digits'");
    expect(html).toContain("url('fonts/ArefRuqaa-Digits.woff2')");
    expect(html).toContain('unicode-range: U+0030-0039');
    expect(readFileSync('capacitor-web/fonts/ArefRuqaa-Digits.woff2').length).toBeGreaterThan(0);
  });
});
