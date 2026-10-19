/**
 * Where the shell keeps its FCM registration id (ADR-0050).
 *
 * The key lives in its own module so nothing that only needs to *read* it has to
 * import the notification module: the background drain reads it to leave this
 * device out of a sync wake, and that drain page loads no React and no push
 * plugin.
 */
export const NATIVE_PUSH_TOKEN_KEY = 'royaraqamia.push.native.token';

/**
 * This device's FCM token, when this realm has one. A service worker has no
 * `localStorage` at all, and neither has a browser tab a native token — both
 * simply have nothing to exclude.
 */
export function readNativePushToken(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(NATIVE_PUSH_TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeNativePushToken(token: string | null): void {
  try {
    if (token) globalThis.localStorage?.setItem(NATIVE_PUSH_TOKEN_KEY, token);
    else globalThis.localStorage?.removeItem(NATIVE_PUSH_TOKEN_KEY);
  } catch {
    // Storage that refuses to persist a token is a device that re-registers on
    // the next open (ADR-0050) — not a reason to fail the caller.
  }
}
