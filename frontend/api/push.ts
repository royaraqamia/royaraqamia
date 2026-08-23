import { request } from '@/frontend/transport/http';
import { VAPID_PUBLIC_KEY } from '@/frontend/shared/constants';

const PUSH_DISABLED_KEY = 'royaraqamia.push.disabled';
const PUSH_PREF_CACHE = 'royaraqamia-push-prefs';
const PUSH_DISABLED_CACHE_URL = '/__push_disabled__';

/**
 * Mirrors the opt-out flag into Cache Storage, which — unlike localStorage —
 * is readable from the service worker while no page is open. The SW refuses
 * to auto-resubscribe on endpoint rotation when this marker exists.
 */
async function syncDisabledCache(disabled: boolean): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(PUSH_PREF_CACHE);
    if (disabled) await cache.put(PUSH_DISABLED_CACHE_URL, new Response('1'));
    else await cache.delete(PUSH_DISABLED_CACHE_URL);
  } catch {
    return;
  }
}

export function isPushDisabledByUser(): boolean {
  if (typeof window === 'undefined' || !('localStorage' in window)) return false;
  try {
    return window.localStorage.getItem(PUSH_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPushDisabledByUser(disabled: boolean): void {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  try {
    if (disabled) window.localStorage.setItem(PUSH_DISABLED_KEY, '1');
    else window.localStorage.removeItem(PUSH_DISABLED_KEY);
  } catch {
    return;
  }
  void syncDisabledCache(disabled);
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    VAPID_PUBLIC_KEY.length > 0
  );
}

/**
 * True when the browser's existing push subscription was created against the
 * same application server key we deploy today. A key rotation (VAPID
 * regeneration) silently orphans every existing subscription: the server's
 * signature no longer verifies against the key the browser subscribed with,
 * so deliveries are rejected even though the subscription "looks" valid.
 * Used by the client auto-heal to re-subscribe without user action.
 */
export function applicationServerKeyMatches(
  subscription: PushSubscription,
  base64Key: string
): boolean {
  if (!base64Key || base64Key.length === 0) return false;
  let current: ArrayBuffer | null;
  try {
    // `applicationServerKey` is not in TS's PushEncryptionKeyName union even
    // though every engine exposes it via getKey(); cast through a wider name.
    const getKey = subscription.getKey as ((name: string) => ArrayBuffer | null) | undefined;
    current = getKey?.('applicationServerKey') ?? null;
  } catch {
    return false;
  }
  if (!current) return false;
  const expected = urlBase64ToUint8Array(base64Key);
  if (current.byteLength !== expected.byteLength) return false;
  const bytes = new Uint8Array(current);
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== expected[i]) return false;
  }
  return true;
}

export type PushSubscribeResult = 'subscribed' | 'denied' | 'unsupported';

export async function subscribeToPush(): Promise<PushSubscribeResult> {
  if (!isPushSupported()) return 'unsupported';

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  let created = false;

  if (!subscription) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    created = true;
  }

  try {
    await request('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription.toJSON()),
    });
    setPushDisabledByUser(false);
    return 'subscribed';
  } catch {
    // Only revoke a subscription we just created; a pre-existing one may
    // still be valid server-side and will be pruned on 404/410 if not.
    if (created) await subscription.unsubscribe();
    return 'denied';
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  setPushDisabledByUser(true);
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  try {
    await request('/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch {
    // The server prunes dead endpoints on the next dispatch (404/410).
  } finally {
    await subscription.unsubscribe();
  }
}
