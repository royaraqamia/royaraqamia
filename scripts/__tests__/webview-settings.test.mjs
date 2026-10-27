import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The shell's WebView settings and the launch numbers (#499), held to the two
 * decisions that cannot be seen in a rendered frame: the document is rasterized
 * under the launch skeleton, and the WebView's own HTTP cache is left at the
 * platform's default so a launch document is the worker's or the network's and
 * never a copy the shell kept.
 *
 * Checked as source text, like `launch-skeleton.test.mjs` and `icon-shape.test.mjs`:
 * the shell has no host-side test that can build an Android view.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGE_DIR = join(
  ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'royaraqamia',
  'app'
);

const activity = readFileSync(join(PACKAGE_DIR, 'MainActivity.java'), 'utf8');

describe('the WebView under the launch skeleton', () => {
  it('rasterizes offscreen, so the skeleton lifts onto a painted document', () => {
    // The skeleton is a view *over* the WebView (#498), so the document's frames
    // until the handover are produced offscreen. Without this the renderer waits
    // for attach, and the first frame after the skeleton is an unpainted one.
    expect(activity).toContain('setOffscreenPreRaster(true)');
    // It has to run once the bridge exists, which is after `super.onCreate`.
    expect(activity).toContain('installWebViewSettings(getBridge())');
  });

  it("leaves the WebView's own HTTP cache alone", () => {
    // `LOAD_DEFAULT` is the only mode in which that cache revalidates like any
    // other browser cache. A document response ships no private-cache freshness
    // (`public, s-maxage=…`, no `ETag`/`Last-Modified`), so nothing pins a build
    // there; a `LOAD_CACHE_*` mode would answer before the worker or the network,
    // which is the second cache #499 exists to keep out of the document's path.
    const sources = readdirSync(PACKAGE_DIR)
      .filter((name) => name.endsWith('.java'))
      .map((name) => [name, readFileSync(join(PACKAGE_DIR, name), 'utf8')]);
    const cacheMode = sources.filter(([, text]) => text.includes('setCacheMode'));
    expect(cacheMode.map(([name]) => name)).toEqual([]);
  });
});

describe('the launch numbers', () => {
  it('are timed from the process fork, not from a callback', () => {
    // The measurement recipe in `docs/mobile/android-shell.md` reads these lines;
    // timing from a callback would only measure the stretch after it.
    expect(activity).toContain('Process.getStartUptimeMillis()');
    expect(activity).toContain('LAUNCH_TAG = "RoyLaunch"');
    expect(activity).toContain('logLaunch("onCreate")');
  });

  it('mark the document, which is the moment the acceptance is about', () => {
    expect(activity).toContain('logLaunch("page committed")');
    // In the same listener that releases the skeleton, and after the `about:`
    // guard, so an empty document's commit is not counted as the site's.
    const listener = activity.slice(activity.indexOf('onPageCommitVisible'));
    expect(listener.indexOf('logLaunch("page committed")')).toBeLessThan(
      listener.indexOf('releaseSkeleton()')
    );
  });
});
