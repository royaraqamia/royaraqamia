import { request } from '@/frontend/transport/http';
import { VAPID_PUBLIC_KEY } from '@/frontend/shared/constants';

const PUSH_DISABLED_KEY = 'royaraqamia.push.disabled';

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

/**
 * Re-subscribes after the push service rotates an endpoint
 * (`pushsubscriptionchange`). Attached to the service worker registration once
 * it is ready; returns a cleanup function.
 */
type ExtendableLikeEvent = Event & { waitUntil: (promise: Promise<unknown>) => void };

export async function registerPushSubscriptionChangeHandler(): Promise<() => void> {
  if (!isPushSupported()) return () => undefined;
  const registration = await navigator.serviceWorker.ready;

  const handler = (event: Event) => {
    (event as ExtendableLikeEvent).waitUntil(
      (async () => {
        if (Notification.permission !== 'granted') return;
        try {
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
          await request('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription.toJSON()),
          });
        } catch {
          // Server keeps pruning dead endpoints; nothing to do here.
        }
      })()
    );
  };

  registration.addEventListener('pushsubscriptionchange', handler);
  return () => registration.removeEventListener('pushsubscriptionchange', handler);
}
