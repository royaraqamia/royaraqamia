'use client';

/**
 * The two ways a bundled surface can reach a remote one (issue #500).
 *
 * `server.url` is app-wide, so a Bundled shell boots on `https://localhost` and
 * every remote route has to be reached deliberately. The spike implements both
 * candidates so the veto table can be filled on a device:
 *
 *   * `webview` — navigate the same WebView to the live origin. History crosses
 *     an origin boundary, the browser's cookie jar for `royaraqamia.com` is the
 *     one the site would have had in the shell, and the Capacitor bridge may be
 *     lost on older WebViews (the upstream bug `capacitor.config.ts` cites).
 *   * `custom-tab` — hand the URL to Android's Custom Tab. The app keeps its
 *     history and its bundled page; the remote surface is a tab the user can
 *     dismiss, with no way back into an authenticated in-app route except
 *     re-entering the app.
 *
 * The choice is runtime state, not compile time: it is persisted so the same
 * APK can answer both columns of the table.
 */

import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';

/** The live origin the APK's `server.url` names today. */
export const REMOTE_ORIGIN = 'https://royaraqamia.com';

/**
 * Routes the app does not own: the public and server-guarded surfaces that stay
 * remote in plan B. `/community` is the one the spike exercises.
 */
const REMOTE_SURFACES = ['/community'] as const;

export type RemoteMechanism = 'webview' | 'custom-tab';

const MECHANISM_KEY = 'spike.remote-mechanism';

let mechanism: RemoteMechanism = 'webview';

/** The mechanism the next crossing uses. */
export function remoteMechanism(): RemoteMechanism {
  return mechanism;
}

/** Read the persisted choice (call once at boot). */
export async function loadRemoteMechanism(): Promise<RemoteMechanism> {
  const { value } = await Preferences.get({ key: MECHANISM_KEY });
  mechanism = value === 'custom-tab' ? 'custom-tab' : 'webview';
  return mechanism;
}

export async function setRemoteMechanism(next: RemoteMechanism): Promise<void> {
  mechanism = next;
  await Preferences.set({ key: MECHANISM_KEY, value: next });
}

/** Whether an href (or the path it names) belongs to the remote origin. */
export function isRemoteSurface(href: string, pathname: string): boolean {
  if (namesRemoteOrigin(href)) return true;
  return REMOTE_SURFACES.some(
    (surface) => pathname === surface || pathname.startsWith(`${surface}/`)
  );
}

/**
 * Whether an absolute href's host is the remote origin.
 *
 * A prefix test on the raw string also accepts `https://royaraqamia.com.evil.example`
 * and `https://evil.example/?next=https://royaraqamia.com`, so the href is parsed
 * and its origin compared whole. A relative href names the bundled shell, and an
 * href that does not parse is not the remote origin either.
 */
function namesRemoteOrigin(href: string): boolean {
  try {
    return new URL(href).origin === REMOTE_ORIGIN;
  } catch {
    return false;
  }
}

/** Leave the bundled origin for `pathname` through `mechanism`. */
export async function openRemote(
  pathname: string,
  search: string,
  chosen: RemoteMechanism = mechanism
): Promise<void> {
  const url = `${REMOTE_ORIGIN}${pathname}${search}`;

  if (chosen === 'custom-tab') {
    await Browser.open({ url });
    return;
  }

  window.location.assign(url);
}
