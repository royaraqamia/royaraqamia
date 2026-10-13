import { request } from '@/frontend/transport/http';
import { isNativeApp, nativePlatform, nativePlugin } from '@/frontend/shared/native-shell';
import { isPushDisabledByUser, setPushDisabledByUser } from '@/frontend/api/push';
import { logger } from '@/frontend/shared/logger';

/**
 * Native push for the Android shell.
 *
 * The WebView has no working `PushManager`, so the browser path in
 * `frontend/api/push.ts` cannot deliver anything inside the app: FCM is the
 * transport, and the plugin is reached through the bridge rather than imported
 * (see `frontend/shared/native-shell.ts`). The token is stored locally so that a
 * sign-out can unregister it even after the app was restarted and the in-memory
 * copy is gone.
 */
const TOKEN_KEY = 'royaraqamia.push.native.token';
/** FCM hands the token back a beat after `register()`; this bounds the wait. */
const REGISTRATION_TIMEOUT_MS = 15_000;

interface PushNotificationPayload {
  /** `registration` event: the FCM token. */
  value?: unknown;
  /** `pushNotificationActionPerformed` event. */
  notification?: { data?: { url?: unknown } };
  data?: { url?: unknown };
}

interface PluginListenerHandle {
  remove?: () => void | Promise<void>;
}

interface PushNotificationsPlugin {
  requestPermissions?: () => Promise<{ receive?: string }>;
  register?: () => Promise<void>;
  addListener?: (
    event: string,
    callback: (payload: PushNotificationPayload) => void
  ) => Promise<PluginListenerHandle> | PluginListenerHandle;
}

export type NativePushResult = 'registered' | 'denied' | 'unsupported' | 'failed';

function plugin(): PushNotificationsPlugin | undefined {
  return nativePlugin<PushNotificationsPlugin>('PushNotifications');
}

/** True only in the shell, with the plugin actually installed. */
export function isNativePushSupported(): boolean {
  if (!isNativeApp()) return false;
  const push = plugin();
  return typeof push?.register === 'function' && typeof push.requestPermissions === 'function';
}

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    return;
  }
}

/** Whether this device has a token registered with the server. */
export function hasNativePushToken(): boolean {
  return readStoredToken() !== null;
}

/**
 * Resolves with the token from the plugin's `registration` event, or `null` when
 * FCM reports an error or never answers. The listeners are registered before
 * `register()` is called — the event can fire in the same tick.
 */
function waitForToken(push: PushNotificationsPlugin): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), REGISTRATION_TIMEOUT_MS);

    void push.addListener?.('registration', (payload) => {
      const token = payload?.value;
      finish(typeof token === 'string' && token.length > 0 ? token : null);
    });
    void push.addListener?.('registrationError', () => finish(null));
    void push.register?.();
  });
}

let inFlight: Promise<NativePushResult> | null = null;

/**
 * Asks for the notification permission, obtains the FCM token and registers it
 * with the server. Idempotent: concurrent callers share one attempt, and
 * re-registering an already-known token is a server-side upsert.
 */
export function registerNativePush(): Promise<NativePushResult> {
  if (!isNativePushSupported()) return Promise.resolve('unsupported');
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<NativePushResult> => {
    const push = plugin();
    if (!push) return 'unsupported';

    try {
      const permission = await push.requestPermissions?.();
      // Android 13+ answers with `receive`; a plugin that reports nothing is
      // treated as granted so an older device is not blocked.
      if (permission && permission.receive && permission.receive !== 'granted') {
        return 'denied';
      }

      const token = await waitForToken(push);
      if (!token) return 'failed';

      await request('/api/push/devices', {
        method: 'POST',
        body: JSON.stringify({
          token,
          platform: nativePlatform() === 'ios' ? 'ios' : 'android',
        }),
      });

      storeToken(token);
      setPushDisabledByUser(false);
      return 'registered';
    } catch (error) {
      logger.warn('Failed to register the device for push', { error: String(error) });
      return 'failed';
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Removes this device's token: on sign-out (so the next person on the phone does
 * not inherit the notifications) and when the user turns the toggle off.
 * Best-effort — the local token is dropped regardless, and FCM prunes a token it
 * can no longer deliver to.
 */
export async function unregisterNativePush(): Promise<void> {
  setPushDisabledByUser(true);
  const token = readStoredToken();
  storeToken(null);
  if (!token) return;

  try {
    await request('/api/push/devices', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    logger.warn('Failed to unregister the device from push', { error: String(error) });
  }
}

/**
 * Re-registers on app open when the user has not opted out, so a token FCM
 * rotated while the app was closed does not silently stop deliveries. Mirrors
 * the browser auto-heal in `frontend/api/push.ts`.
 */
export function healNativePushRegistration(): void {
  if (!isNativePushSupported() || isPushDisabledByUser()) return;
  if (!hasNativePushToken()) return;
  void registerNativePush();
}

let actionHandlerInstalled = false;

/**
 * Routes a notification tap to the page it is about. Installed once; a payload
 * without a usable path is ignored, so the app simply opens as usual.
 */
export function installNativePushHandlers(): void {
  const push = plugin();
  if (actionHandlerInstalled || !isNativeApp() || typeof push?.addListener !== 'function') return;
  actionHandlerInstalled = true;

  void push.addListener('pushNotificationActionPerformed', (payload) => {
    const url = payload?.notification?.data?.url ?? payload?.data?.url;
    if (typeof url !== 'string' || !url.startsWith('/')) return;
    window.location.assign(url);
  });
}
