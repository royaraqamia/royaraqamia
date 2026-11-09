import { ApiError, request } from '@/frontend/transport/http';
import { VAPID_PUBLIC_KEY } from '@/frontend/shared/constants';

const PUSH_DISABLED_KEY = 'royaraqamia.push.disabled';
const PUSH_LAST_SYNC_KEY = 'royaraqamia.push.lastSync';
const PUSH_PENDING_SYNC_KEY = 'royaraqamia.push.pendingSync';
const PUSH_RETRY_KEY = 'royaraqamia.push.retry';
const PUSH_LAST_SYNC_THROTTLE_MS = 24 * 60 * 60 * 1000;
/** A failed save waits this long before the next visit retries it on its own. */
const RETRY_COOLDOWN_MS = 5 * 60 * 1000;
/**
 * The subscribe route allows 20 calls an hour per account, and a sliding window
 * counts the refused calls too. Backing off for half an hour leaves the bucket
 * room to drain instead of refilling it on every visit.
 */
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;
const MIN_COOLDOWN_MS = 60 * 1000;
const MAX_COOLDOWN_MS = 60 * 60 * 1000;
const PUSH_PREF_CACHE = 'royaraqamia-push-prefs';
const PUSH_DISABLED_CACHE_URL = '/__push_disabled__';

/** Why the last attempt to save this browser's subscription did not land. */
export type PushFailure =
  'denied' | 'unsupported' | 'unreachable' | 'rateLimited' | 'unauthorized' | 'failed';

export type PushSubscribeResult = 'subscribed' | PushFailure;

/** A failure worth remembering, so the next visit does not repeat it at once. */
export type PushRetryKind = Exclude<PushFailure, 'denied' | 'unsupported'>;

interface PushRetryRecord {
  kind: PushRetryKind;
  until: number;
}

function readStorage(key: string): string | null {
  if (typeof window === 'undefined' || !('localStorage' in window)) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function isRetryKind(value: unknown): value is PushRetryKind {
  return (
    value === 'unreachable' ||
    value === 'rateLimited' ||
    value === 'unauthorized' ||
    value === 'failed'
  );
}

function readRetry(now: number): PushRetryRecord | null {
  const raw = readStorage(PUSH_RETRY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PushRetryRecord>;
    if (typeof parsed.until !== 'number' || parsed.until <= now) {
      writeStorage(PUSH_RETRY_KEY, null);
      return null;
    }
    return isRetryKind(parsed.kind) ? { kind: parsed.kind, until: parsed.until } : null;
  } catch {
    return null;
  }
}

/**
 * The failure a previous attempt left behind, while its cooldown is still
 * running. The row uses it instead of asking again: an automatic retry on every
 * visit is what kept a refused bucket full and made one 429 permanent.
 */
export function pushRetryKind(now = Date.now()): PushRetryKind | null {
  return readRetry(now)?.kind ?? null;
}

export function clearPushRetry(): void {
  writeStorage(PUSH_RETRY_KEY, null);
}

function recordPushFailure(result: PushRetryKind, retryAfterMs?: number): void {
  const requested =
    result === 'rateLimited' ? (retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS) : RETRY_COOLDOWN_MS;
  const cooldown = Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, requested));
  const record: PushRetryRecord = { kind: result, until: Date.now() + cooldown };
  writeStorage(PUSH_RETRY_KEY, JSON.stringify(record));
}

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
  return readStorage(PUSH_DISABLED_KEY) === '1';
}

export function setPushDisabledByUser(disabled: boolean): void {
  writeStorage(PUSH_DISABLED_KEY, disabled ? '1' : null);
  void syncDisabledCache(disabled);
}

/**
 * True when the browser holds a subscription the server has never acknowledged.
 * It cannot deliver, so the toggle must not read it as "enabled"; the marker
 * clears as soon as the POST lands, without creating a second endpoint.
 */
export function isPushSubscriptionPendingSync(): boolean {
  return readStorage(PUSH_PENDING_SYNC_KEY) === '1';
}

function setPushPendingSync(pending: boolean): void {
  writeStorage(PUSH_PENDING_SYNC_KEY, pending ? '1' : null);
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

/**
 * `denied` is the browser refusing permission and nothing else. A refusal from
 * the server is named by its own cause: `rateLimited` when it asked us to wait,
 * `unauthorized` when the session is gone, and `unreachable` only when `fetch`
 * itself rejected — a surface must name the cause it actually has (ADR-0031).
 */
function failureFrom(error: unknown): PushRetryKind {
  if (!(error instanceof ApiError) || error.status === undefined) return 'unreachable';
  if (error.code === 'rate_limited' || error.status === 429) return 'rateLimited';
  if (error.code === 'session_expired' || error.status === 401) return 'unauthorized';
  return 'failed';
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
  await request('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
  });
}

/** Best-effort server-side removal: the dispatch prune covers a failed call. */
async function deleteSubscriptionRow(endpoint: string): Promise<void> {
  try {
    await request('/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // The server prunes dead endpoints on the next dispatch (404/410).
  }
}

/**
 * Saves a subscription the browser already holds, and records the refusal when
 * the server will not take it.
 *
 * The subscription is deliberately kept on failure: it is still valid, so the
 * next attempt only has to repeat this idempotent POST. The old code
 * unsubscribed here, which made every retry mint a new endpoint — churn against
 * the push service — and left nothing for the retry to reuse. The pending marker
 * is what keeps the toggle honest in between: a subscription the server has not
 * acknowledged is not enabled.
 */
async function saveSubscription(subscription: PushSubscription): Promise<PushSubscribeResult> {
  try {
    await postSubscription(subscription);
    writeStorage(PUSH_LAST_SYNC_KEY, String(Date.now()));
    setPushPendingSync(false);
    clearPushRetry();
    return 'subscribed';
  } catch (error) {
    const result = failureFrom(error);
    setPushPendingSync(true);
    recordPushFailure(result, error instanceof ApiError ? error.retryAfterMs : undefined);
    return result;
  }
}

/**
 * Idempotent re-POST of an existing subscription, which both refreshes its
 * liveness timestamp server-side and retries a save that never landed. Throttled
 * to once per day per browser once it has succeeded, so a visit does not spend
 * the subscribe bucket.
 */
export async function refreshSubscriptionLiveness(
  existing: PushSubscription
): Promise<PushSubscribeResult> {
  const last = Number(readStorage(PUSH_LAST_SYNC_KEY));
  const throttled = Number.isFinite(last) && Date.now() - last < PUSH_LAST_SYNC_THROTTLE_MS;
  if (throttled) return 'subscribed';
  return saveSubscription(existing);
}

export async function subscribeToPush(): Promise<PushSubscribeResult> {
  if (!isPushSupported()) return 'unsupported';

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const result = await saveSubscription(subscription);
  if (result === 'subscribed') setPushDisabledByUser(false);
  return result;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  setPushDisabledByUser(true);
  setPushPendingSync(false);
  clearPushRetry();
  writeStorage(PUSH_LAST_SYNC_KEY, null);
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await deleteSubscriptionRow(subscription.endpoint);
  await subscription.unsubscribe();
}

/**
 * Releases this browser's push registration on sign-out, while the session still
 * authorizes the DELETE. Both the server row and the browser subscription go, so
 * the next account on this browser does not inherit the notifications and can
 * subscribe again silently — the permission survives, and `subscribeToPush()`
 * creates a fresh endpoint owned by the new user.
 *
 * Best-effort by design, the same contract as `unregisterNativePush`: a missing
 * worker, a failed request or a refused unsubscribe must never block or fail a
 * sign-out. Unlike the toggle, it does not set the opt-out flag: that preference
 * belongs to the next person on the device, not to the account that left.
 */
export async function releasePushSubscription(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    // `ready` never settles when nothing ever registers, so ask for the current
    // registration instead of waiting for one sign-out does not need.
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await deleteSubscriptionRow(subscription.endpoint);
    await subscription.unsubscribe();
    setPushPendingSync(false);
    clearPushRetry();
    writeStorage(PUSH_LAST_SYNC_KEY, null);
  } catch {
    // Push never gets a vote on whether the user can sign out.
  }
}
