import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as acorn from 'acorn';

/**
 * The local page Capacitor shows when the site cannot be reached, or when the
 * installed System WebView is below the floor (ADR-0067, amended 2026-10-30).
 *
 * It is a hand-written HTML file in `capacitor-web/` and a config value in
 * `capacitor.config.ts`; nothing at build time connects them. A moved page, a
 * floor that drifts from the config, or a "fix" written in the site's modern
 * syntax would all look fine in a browser and fail exactly where this page is
 * meant to work — on an old, offline WebView. So the agreement is pinned here.
 *
 * The page paints nothing: it is the site's own background and no notice, since
 * the offline card and `/offline` were withdrawn. What remains is the floor
 * check and ADR-0067's recovery amendment — one reload, on the first `online`
 * event, guarded by a session flag — and this test pins the guard, not copy.
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

/**
 * The document's markup with its one inline script cut out by offsets, the same
 * way `inlineScript` takes the script: a regexp that tries to match `<script>`
 * end tags is the thing CodeQL flags, and this page has exactly one script.
 */
function withoutInlineScript(source) {
  const open = source.toLowerCase().indexOf('<script');
  if (open < 0) return source;
  const body = source.indexOf('>', open);
  if (body < 0) return source;
  const close = source.toLowerCase().indexOf('</script', body + 1);
  if (close < 0) return source;
  const end = source.indexOf('>', close);
  return source.slice(0, open) + source.slice(end < 0 ? close : end + 1);
}

const pageScript = inlineScript(html);
/** What a reader of the document sees: the body without its script. */
const body = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
const bodyText = withoutInlineScript(body)
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

describe('the shell fallback page', () => {
  it('is the page the Capacitor config names, inside the bundled webDir', () => {
    expect(errorPath).toBe('unavailable.html');
    expect(config).toContain("webDir: 'capacitor-web'");
    expect(existsSync(`capacitor-web/${errorPath}`)).toBe(true);
  });

  it('uses one WebView floor in the config and in the page', () => {
    expect(configuredFloor).toBeGreaterThanOrEqual(55);
    expect(pageFloor).toBe(configuredFloor);
    expect(pageScript).toContain('var outdated = current > 0 && current < MINIMUM_WEBVIEW;');
    // An engine below the floor cannot run the site, so the page stays blank and
    // arms no recovery.
    expect(pageScript).toContain('if (outdated) return;');
  });

  it('leaves Capacitor input capture off, so the WebView keeps its own IME connection', () => {
    // `captureInput` swaps the WebView's `InputConnection` for a plain
    // `BaseInputConnection`, which has no bidi model: an Arabic edit made
    // mid-text is committed at the end of the field instead
    // (`docs/mobile/android-shell.md`). A browser never takes that path, so no
    // page-level test can see it — this is the cheap guard that can.
    expect(config).not.toMatch(/captureInput:\s*true/);
  });

  it('parses as ES5, because the page is shown when the WebView is old', () => {
    expect(pageScript.trim().length).toBeGreaterThan(0);
    expect(() => acorn.parse(pageScript, { ecmaVersion: 5, sourceType: 'script' })).not.toThrow();
    // Acorn would accept `class` with a later version; this page must not rely
    // on the site's own ES2022 baseline (class fields / static blocks), which is
    // exactly what WebView 83 fails on.
    expect(pageScript).not.toMatch(/\bclass\s|=>|\bconst\b|\blet\b|\?\.|\?\?/);
  });

  it('paints no notice, no card and no retry link', () => {
    // The body is empty: no heading, no copy, no anchor, no brand.
    expect(bodyText).toBe('');
    expect(html).not.toContain('إعادة المحاولة');
    expect(html).not.toContain('تعذَّر فتح الموقع');
    expect(html).not.toContain('يلزم تحديث عرض النظام');
    expect(html).not.toContain('Android System WebView');
    expect(html).not.toMatch(/<a\b/i);
    expect(html).not.toMatch(/<main\b/i);
    expect(html).not.toMatch(/<h1\b/i);
    // Nothing is revealed after hydration either: the script only decides
    // whether recovery is armed, it never writes into the document.
    expect(pageScript).not.toContain('hidden');
    expect(pageScript).not.toContain('textContent');
  });

  it('reloads once on reconnect behind a session guard', () => {
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

    // The one-shot recovery (#447): exactly one `online` listener, guarded by a
    // sessionStorage flag that the page after the first reload reads and refuses
    // to re-arm.
    expect((pageScript.match(/addEventListener\('online'/g) ?? []).length).toBe(1);
    expect(pageScript).toContain('RECOVERY_FLAG');
    expect(pageScript).toContain("sessionStorage.setItem(RECOVERY_FLAG, '1')");
    expect(pageScript).toContain('sessionStorage.getItem(RECOVERY_FLAG) !== null');
    expect(pageScript).toContain("removeEventListener('online'");
    expect(pageScript).toContain("window.location.assign('https://royaraqamia.com')");
  });

  it('does not fetch anything from the network', () => {
    expect(html).toContain('width=device-width, initial-scale=1');
    expect(html).toContain('box-sizing: border-box');

    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toContain('url(http');
    expect(html).not.toContain('fonts.googleapis.com');
    // No bundled font either: there is no text to set.
    expect(html).not.toContain('@font-face');
    expect(existsSync('capacitor-web/fonts')).toBe(false);
  });
});
