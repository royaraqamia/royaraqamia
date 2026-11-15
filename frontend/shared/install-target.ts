/**
 * How this device installs the app, read from the user agent (#1500).
 *
 * One platform, one channel — the same row never offers two installs. The
 * answer has four shapes because the browsers differ in what they can actually
 * do, not in what we would like to offer:
 *
 * - **Android** ships an APK, so there is nothing for the web to prompt.
 * - **Chromium on a desktop** fires `beforeinstallprompt`; the browser does the
 *   work and the row only has to call it.
 * - **Safari** (iOS, and macOS 17+) installs, but exposes no prompt at all. Its
 *   only honest answer is the steps in its own menus, so the row becomes a
 *   written instruction instead of a dead button.
 * - **Firefox everywhere, and the non-Safari browsers on iOS**, have no install
 *   path. Nothing is offered, because an instruction there would be untrue.
 *
 * The iOS check is the user agent *plus* the touch points: iPadOS reports a
 * desktop Macintosh agent, and reading it as a desktop would send an iPad to a
 * prompt its Safari does not have.
 */
export type InstallChannel =
  /** The APK the shell publishes — a download, never a prompt. */
  | 'android-apk'
  /** Safari on iOS: Share → Add to Home Screen. */
  | 'ios-steps'
  /** Safari 17+ on macOS: File → Add to Dock. */
  | 'macos-steps'
  /** A browser with an install prompt of its own. */
  | 'browser-prompt'
  /** No install path on this browser: offer nothing. */
  | 'none';

/**
 * The channel this user agent can use. Inputs are the browser's own answers,
 * not the site's guesses: `maxTouchPoints` is what separates an iPad from a Mac.
 */
export function installChannelFor(userAgent: string, maxTouchPoints: number): InstallChannel {
  if (/Android/i.test(userAgent)) return 'android-apk';

  const isIos =
    /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);

  if (isIos) return isSafari(userAgent) ? 'ios-steps' : 'none';

  if (isSafari(userAgent) && /Macintosh/i.test(userAgent)) return 'macos-steps';

  // Firefox has never shipped an install path, on any platform.
  if (/Firefox\//i.test(userAgent)) return 'none';

  return 'browser-prompt';
}

/**
 * Safari, as opposed to the browsers that only borrow its engine. Chrome, Edge,
 * Firefox and Opera on iOS all run WebKit and all say `Safari` in the agent,
 * but none of them can add to the home screen — their own tokens are the only
 * way to tell, and they are the reason this is not a `/Safari/` test.
 */
function isSafari(userAgent: string): boolean {
  return (
    /Safari\//i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Edg\/|OPR\//i.test(userAgent)
  );
}
