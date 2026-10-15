import { logger } from './logger';

/**
 * Whether the Android shell is behind the APK published beside the site (ADR-0043).
 *
 * The shell is a remote-URL app (ADR-0036): its web half updates the way the site
 * does (ADR-0042), while the installed APK only moves when someone installs one.
 * The shell asks the user about a newer APK itself — natively, because the page
 * cannot reach native APIs reliably: with `server.url` set, Capacitor's bridge
 * reaches the document through a proxy, and on the WebView the app still meets on
 * older devices one failed proxied request takes the injected script with it, so
 * `window.Capacitor` is simply absent. An implementation that needed the bridge
 * would silently do nothing on those devices.
 *
 * What the page still needs is one bit — *is the shell already asking?* — so that
 * the two never speak at once. The shell states it where every document can read
 * it: its own user agent. Two spellings, and both have to stay readable, because
 * an installed shell can only ever send the one it was built with:
 *
 *   `RoyaraqamiaShell/20003`        — the counter, all a shell before ADR-0046 sent
 *   `RoyaraqamiaShell/1.0.3+20003`  — the version a user reads, then the counter
 *
 * The page compares the counter with the manifest on its own origin, and holds its
 * own offer back while the shell's is pending. Absent token (a browser, or a shell
 * built before any of this) reads as "no shell update pending", which leaves the
 * web prompt working everywhere else.
 */

export const SHELL_USER_AGENT_TOKEN = 'RoyaraqamiaShell';
export const SHELL_MANIFEST_PATH = '/android/latest.json';

/** The published APK, as the manifest beside the site describes it. */
export interface ShellManifest {
  versionCode: number;
  versionName: string | null;
  /** https URL of the newest APK, or null when the manifest names no usable one. */
  apkUrl: string | null;
  minSupportedVersionCode: number;
}

/**
 * Both spellings, in one pattern, with the trailing guard that makes the
 * difference: without `(?![\d.])` the counter would be read out of the *name*
 * (`1.0.3+20003` would answer "1", and a shell at 1.0.3 would look like a shell
 * from before the counter existed).
 */
const SHELL_TOKEN_PATTERN = new RegExp(
  `${SHELL_USER_AGENT_TOKEN}/(?:(\\d+\\.\\d+\\.\\d+)\\+)?(\\d+)(?![\\d.])`
);

export interface ShellUpdateState {
  /** A newer APK is published than the one the shell says it is. */
  updatePending: boolean;
  /** The installed shell is too old for the current site. */
  unsupported: boolean;
  installedCode: number | null;
  latestCode: number | null;
}

/** Nothing known about a shell, which is also the truth in a browser. */
export const SHELL_UPDATE_IDLE: ShellUpdateState = {
  updatePending: false,
  unsupported: false,
  installedCode: null,
  latestCode: null,
};

/** The shell version a user agent names, or null when this is not the shell. */
export function shellVersionFromUserAgent(userAgent: string): number | null {
  const match = SHELL_TOKEN_PATTERN.exec(userAgent);
  if (!match || match[2] === undefined) return null;
  const code = Number(match[2]);
  return Number.isInteger(code) ? code : null;
}

/** The installed app version a user agent names, or null on a shell too old to say. */
export function shellVersionNameFromUserAgent(userAgent: string): string | null {
  const match = SHELL_TOKEN_PATTERN.exec(userAgent);
  return match?.[1] ?? null;
}

/**
 * What the app calls itself where a user can read it: `1.0.3 (20003)`, or just
 * the counter for a shell built before it carried a name. Null in a browser,
 * which is what keeps this out of the web entirely.
 */
export function shellDisplayVersion(userAgent: string): string | null {
  const code = shellVersionFromUserAgent(userAgent);
  if (code === null) return null;
  const name = shellVersionNameFromUserAgent(userAgent);
  return name ? `${name} (${code})` : String(code);
}

const asCode = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) ? value : 0;

/** Reads a manifest body defensively: anything unreadable is simply absent. */
export function toShellManifest(value: unknown): ShellManifest {
  const record = (value ?? {}) as Record<string, unknown>;
  const apkUrl = typeof record.apkUrl === 'string' ? record.apkUrl.trim() : '';
  const versionName = typeof record.versionName === 'string' ? record.versionName.trim() : '';

  return {
    versionCode: asCode(record.versionCode),
    versionName: versionName || null,
    // Only https: this URL becomes a link a visitor is asked to install from.
    apkUrl: apkUrl.startsWith('https://') ? apkUrl : null,
    minSupportedVersionCode: asCode(record.minSupportedVersionCode),
  };
}

/**
 * Reads the published manifest, for any document. `refreshShellUpdate` asks this
 * only when the user agent says it is the shell; the account page needs the same
 * answer in a browser too, where it offers the APK as a download. Null means the
 * manifest could not be read — never a claim that an update exists.
 */
export async function fetchShellManifest({
  fetchImpl = fetch,
  manifestPath = SHELL_MANIFEST_PATH,
}: {
  fetchImpl?: typeof fetch;
  manifestPath?: string;
} = {}): Promise<ShellManifest | null> {
  try {
    // Never from a cache: a stale manifest would keep the page quiet about an
    // update the shell is not actually offering.
    const response = await fetchImpl(manifestPath, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return toShellManifest(await response.json());
  } catch (error) {
    logger.warn('Shell update manifest unreadable', { error: String(error) });
    return null;
  }
}

/**
 * The decision, from the manifest and the shell's own version. A manifest that
 * is missing, half-written, or names an older version than the installed shell
 * all read as "nothing pending": the safe direction is silence, never a page
 * claiming an APK exists.
 */
export function toShellUpdateState(
  manifest: unknown,
  installedCode: number | null
): ShellUpdateState {
  if (installedCode === null) return SHELL_UPDATE_IDLE;

  const value = (manifest ?? {}) as Record<string, unknown>;
  const latestCode = asCode(value.versionCode);
  const minSupported = asCode(value.minSupportedVersionCode);

  return {
    updatePending: latestCode > installedCode,
    unsupported: minSupported > installedCode,
    installedCode,
    latestCode,
  };
}

let state: ShellUpdateState = SHELL_UPDATE_IDLE;
const listeners = new Set<() => void>();

function publish(next: ShellUpdateState): void {
  const changed =
    next.updatePending !== state.updatePending ||
    next.unsupported !== state.unsupported ||
    next.installedCode !== state.installedCode ||
    next.latestCode !== state.latestCode;
  if (!changed) return;
  state = next;
  for (const listener of listeners) listener();
}

/** Current snapshot, for `useSyncExternalStore`. */
export function getShellUpdateState(): ShellUpdateState {
  return state;
}

export function subscribeShellUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reads the manifest once and publishes the answer. A browser returns before the
 * fetch: there is no shell to be behind.
 */
export async function refreshShellUpdate({
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  fetchImpl = fetch,
  manifestPath = SHELL_MANIFEST_PATH,
}: {
  userAgent?: string;
  fetchImpl?: typeof fetch;
  manifestPath?: string;
} = {}): Promise<void> {
  const installedCode = shellVersionFromUserAgent(userAgent);
  if (installedCode === null) {
    publish(SHELL_UPDATE_IDLE);
    return;
  }

  const manifest = await fetchShellManifest({ fetchImpl, manifestPath });
  publish(
    manifest ? toShellUpdateState(manifest, installedCode) : { ...SHELL_UPDATE_IDLE, installedCode }
  );
}

/**
 * What the page does with the channel: look once per document, so the prompt
 * knows from its first render whether the shell is the one speaking. Returns a
 * disposer for symmetry with the worker watcher, though there is nothing to
 * detach yet.
 */
export function observeShellUpdate(): () => void {
  void refreshShellUpdate();
  return () => {};
}
