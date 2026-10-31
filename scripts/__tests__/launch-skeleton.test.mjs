import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The launch skeleton (#498, ADR-0061) — the surface between the document window
 * and the document, held to the four things that make it a handover rather than a
 * second screen: it paints the window's own colour, it carries the site's chrome
 * proportions, it leaves when the document commits, and it leaves on its own when
 * the document does not.
 *
 * It is checked as source text, like the splash in `icon-shape.test.mjs`, because
 * the shell has no host-side test that can lay a view out: the JVM tests in
 * `android/app/src/test` run without an Android runtime.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const MAIN = join(
  ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'royaraqamia',
  'app',
  'MainActivity.java'
);

const read = (...parts) => readFileSync(join(RES, ...parts), 'utf8');

/** The start tag that carries an id, so its attributes can be compared. */
const tagFor = (xml, id) => {
  const match = new RegExp(`<[^>]*android:id="@\\+id/${id}"[^>]*>`).exec(xml);
  return match ? match[0] : '';
};

describe('the launch skeleton', () => {
  const layout = read('layout', 'shell_skeleton.xml');

  it("paints the document window's own colour", () => {
    // #498's acceptance is "no colour flash" while the document loads: the window
    // behind it and the skeleton are one colour, so the skeleton reads as the page
    // arriving rather than as an empty surface. The splash is no longer part of
    // that sequence — it belongs to the launcher and paints the app's own
    // background (#752) — so what stays pinned is the skeleton against the window
    // it covers.
    expect(tagFor(layout, 'shell_skeleton')).toContain(
      'android:background="@color/roy_launch_background"'
    );

    const colors = read('values', 'colors.xml');
    const launch = /<color name="roy_launch_background">#([0-9A-Fa-f]{6,8})<\/color>/.exec(colors);
    expect(launch, 'values/colors.xml: no roy_launch_background').not.toBeNull();

    const capacitor = readFileSync(join(ROOT, 'capacitor.config.ts'), 'utf8');
    const window = /backgroundColor:\s*'#([0-9A-Fa-f]{6})'/.exec(capacitor)?.[1];
    expect(window, 'capacitor.config.ts: no backgroundColor').toBeDefined();

    // 8-digit `#AARRGGBB` here, `#RRGGBB` there: compare the RGB half.
    expect(launch[1].slice(-6).toLowerCase()).toBe(window.toLowerCase());
  });

  it("carries the site's chrome proportions", () => {
    // `frontend/ui/Navbar.tsx` is `h-16` with a 32dp wordmark;
    // `frontend/ui/navbar/BottomTabBar.tsx` is `min-h-14` over three primary
    // routes (the issue guessed five - the tab bar was cut to three when the
    // secondary entries moved into the top bar's خدماتنا menu).
    expect(tagFor(layout, 'shell_skeleton_top_bar')).toContain('android:layout_height="64dp"');
    expect(tagFor(layout, 'shell_skeleton_tab_bar')).toContain('android:layout_height="56dp"');

    const slots = layout.match(/android:id="@\+id\/shell_skeleton_tab_\d+"/g) ?? [];
    expect(slots).toHaveLength(3);

    const cards = layout.match(/android:background="@drawable\/shell_skeleton_card"/g) ?? [];
    expect(cards).toHaveLength(3);
  });

  it('says nothing', () => {
    // Stateless by construction (ADR-0061): a skeleton with copy would be a
    // second interface to keep in step with the site's, and would need translating.
    expect(layout).not.toMatch(/android:text=/);
  });
});

describe('the launch skeleton’s handover', () => {
  const activity = readFileSync(MAIN, 'utf8');

  it('is the activity’s own view, added over the WebView', () => {
    expect(activity).toContain('R.layout.shell_skeleton');
    expect(activity).toContain('findViewById(android.R.id.content)');
    // A placeholder that a screen reader announced would be read as the app.
    expect(activity).toContain('IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS');
  });

  it('leaves the splash to the platform, and lands on the skeleton', () => {
    // #498 asked for `setKeepOnScreenCondition { !pageCommitted }`. Measured on the
    // API 35 emulator: the condition is read once and never again, so the splash
    // stays up until the page commits (7.5 s on a cold launch) and never lifts at
    // all with the radio off. `SplashScreen` polls it from a pre-draw listener on the
    // decor view, and the platform does not traverse a window behind its starting
    // surface. The platform's own dismissal is the first frame the app draws, and
    // that frame is the skeleton, so nothing here should reintroduce the condition.
    expect(activity).not.toMatch(/\.setKeepOnScreenCondition\(/);
    expect(activity).toContain('installLaunchSkeleton()');
  });

  it('leaves on the document’s first committed frame', () => {
    expect(activity).toContain('onPageCommitVisible');
    expect(activity).toContain('releaseSkeleton()');
    // `about:blank` commits before the site's own frame; releasing on it would put
    // the empty surface back for the rest of the load.
    expect(activity).toContain('url.startsWith("about:")');
    // The callback runs inside the bridge's iteration over its listener list, so
    // removing the listener inside it throws ConcurrentModificationException - which
    // the API 35 emulator did on the first commit.
    expect(activity).toContain('view.post(() -> bridge.removeWebViewListener(this))');
  });

  it('leaves on its own after 2.5 seconds, radio off or not', () => {
    const ceiling = /SKELETON_CEILING_MS = (\d+);/.exec(activity);
    expect(ceiling, 'MainActivity: no SKELETON_CEILING_MS').not.toBeNull();
    expect(Number(ceiling[1])).toBe(2500);
    // Scheduled on the skeleton itself and unscheduled with it, so a launch that
    // finishes inside the ceiling does not leave the callback behind.
    expect(activity).toContain('skeleton.postDelayed(skeletonCeiling, SKELETON_CEILING_MS)');
    expect(activity).toContain('skeleton.removeCallbacks(skeletonCeiling)');
  });
});
