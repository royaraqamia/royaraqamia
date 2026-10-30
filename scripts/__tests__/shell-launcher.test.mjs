import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The launcher draws the app's own frame, and the engine is behind it (#647).
 *
 * #647's last acceptance criterion is "no WebView is instantiated at launch,
 * asserted by a test rather than by reading the code". On a device that is a claim
 * about the activity the system starts, so this file asserts the two facts that
 * *make* it true of the launcher, from the tree:
 *
 * 1. the launcher is the Compose shell — MAIN/LAUNCHER, the splash theme, both
 *    deep-link filters — and the document is not the launcher at all;
 * 2. nothing the launcher draws names `WebView` or the Capacitor bridge. The only
 *    shell file that may name the document activity is the one call that hands a
 *    route over, and it runs after the frame, on a navigation — never to draw it.
 *
 * It does not, and cannot, assert the process-wide claim #662 makes ("instantiates
 * none at launch"): the hand-over starts the document, which builds one. ADR-0105
 * records that gap rather than hiding it.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(ROOT, 'android', 'app', 'src', 'main');
const SHELL = join(APP, 'kotlin', 'com', 'royaraqamia', 'app', 'shell');

const manifest = readFileSync(join(APP, 'AndroidManifest.xml'), 'utf8');

/** The `<activity>` element whose name ends with [name]. */
export function activityBlock(source, name) {
  const match = source.match(new RegExp(`<activity[^>]*android:name="[^"]*${name}"[^>]*>`));
  return match ? match[0] : null;
}

function shell(name) {
  return readFileSync(join(SHELL, name), 'utf8');
}

/** The file without its comments: a comment may name what the code does not do. */
function code(name) {
  return shell(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('the launcher', () => {
  it('is the Compose shell, with the splash theme', () => {
    const launcher = activityBlock(manifest, 'shell.ShellActivity');
    expect(launcher, 'AndroidManifest.xml declares no .shell.ShellActivity').not.toBeNull();
    expect(launcher).toContain('android:exported="true"');
    expect(launcher).toContain('android:theme="@style/AppTheme.NoActionBarLaunch"');

    const filters = manifest.slice(manifest.indexOf(launcher));
    expect(filters).toContain('android.intent.category.LAUNCHER');
    expect(filters).toContain('android:scheme="https" android:host="royaraqamia.com"');
    expect(filters).toContain('android:scheme="royar" android:host="auth"');
  });

  it('is the only activity with a MAIN/LAUNCHER filter', () => {
    const launchers = [...manifest.matchAll(/android\.intent\.category\.LAUNCHER/g)];
    expect(launchers).toHaveLength(1);
    expect(activityBlock(manifest, 'shell.ShellActivity')).not.toBeNull();
  });

  it('leaves the document without a launcher role or a second splash', () => {
    const document = activityBlock(manifest, '.MainActivity');
    expect(document).not.toBeNull();
    expect(document).not.toContain('LAUNCHER');
    expect(document).not.toContain('android.intent.action.VIEW');
    expect(document).toContain('android:theme="@style/AppTheme.NoActionBar"');
    // `singleTop`: a second hand-over reuses the instance instead of stacking
    // another copy of the same screen behind the same frame.
    expect(document).toContain('android:launchMode="singleTop"');
  });

  it('draws its first frame from Compose, with nothing that builds a browser', () => {
    const frame = [
      'ShellActivity.kt',
      'ShellFrame.kt',
      'ShellTabBar.kt',
      'ShellTab.kt',
      'Routes.kt',
      'DeepLink.kt',
      'ShellBackStack.kt',
      'NativeSurfaces.kt',
    ];

    for (const name of frame) {
      const source = code(name);
      expect(source, `${name} names a WebView`).not.toMatch(/\bWebView\b/);
      expect(source, `${name} names the Capacitor bridge`).not.toMatch(/\bCapacitor\b/);
    }

    const launcher = shell('ShellActivity.kt');
    expect(launcher).toContain('installSplashScreen()');
    expect(launcher).toContain('RoyaraqamiaTheme');
    expect(launcher).toContain('LayoutDirection.Rtl');
    // The frame is drawn before anything is opened on top of it.
    expect(launcher).toContain('withFrameNanos');
  });

  it('keeps the document behind one named call', () => {
    const files = [
      'ShellActivity.kt',
      'ShellFrame.kt',
      'ShellTabBar.kt',
      'ShellTab.kt',
      'Routes.kt',
      'DeepLink.kt',
      'ShellBackStack.kt',
      'NativeSurfaces.kt',
      'WebSurface.kt',
    ].filter((name) => existsSync(join(SHELL, name)));

    const naming = files.filter((name) => /\bMainActivity\b/.test(code(name)));
    expect(naming).toEqual(['WebSurface.kt']);
    // The route becomes a URL in one place, on our own origin — the hand-over
    // cannot open a host the deep-link grammar refuses.
    expect(shell('WebSurface.kt')).toContain('DeepLink.webUrl');
  });

  it('routes every deep link the manifest accepts', () => {
    // The two filters the launcher declares are the two shapes `DeepLink` parses;
    // a third filter with no route behind it would open the shell and go nowhere.
    expect(manifest).not.toContain('android:scheme="http"');
    const deepLink = shell('DeepLink.kt');
    expect(deepLink).toContain('const val SCHEME = "royar"');
    expect(deepLink).toContain('const val HOST = "royaraqamia.com"');
  });
});
