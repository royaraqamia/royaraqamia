/**
 * The Local Store is partitioned by identity, not by tab: a guest's data and
 * each signed-in user's data live in separate IndexedDB databases, so they
 * never bleed into one another. `localStoreName` is the single place that
 * names those databases.
 */
export type LocalIdentity = 'guest' | `user:${string}`;

export const GUEST_IDENTITY: LocalIdentity = 'guest';

export function userIdentity(userId: string): LocalIdentity {
  return `user:${userId}`;
}

/** Derives the identity from a session/user shape; anything with a string `id` is signed in. */
export function identityFromUser(user: unknown): LocalIdentity {
  const id = (user as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? userIdentity(id) : GUEST_IDENTITY;
}

/**
 * The account id inside a `user:<id>` identity, or `null` for a guest. The
 * inverse of {@link userIdentity}, for the places that hold an identity and need
 * the id itself — a `user_id=eq.…` Realtime filter, for one (ADR-0060).
 */
export function identityUserId(identity: LocalIdentity): string | null {
  return identity.startsWith('user:') ? identity.slice('user:'.length) : null;
}

/** `<product>__<identity>` — one durable database per product, per identity. */
export function localStoreName(product: string, identity: LocalIdentity): string {
  return `${product}__${identity}`;
}

/**
 * The identity this device last resolved, remembered so a product root can open
 * the right Local Store on its **first** render instead of waiting for the
 * session (#493).
 *
 * The rows were always on disk; what was missing was the answer to "which
 * partition are they in", which only `getSession()` could give — and that is a
 * dynamic import, a cookie check and an async call after hydration. Persisting
 * the answer turns the boot into: read one string, open that database, paint.
 * The session check then runs in parallel and reconciles.
 *
 * The value is a single `localStorage` string, so the write is cheap, shared by
 * every tab on the origin, and survives the reload an offline wake performs.
 * It is **not** a credential: it names a namespace that a database may or may
 * not exist under, and holding it grants nothing — RLS and the session cookie
 * are still the only things that authorize a read.
 */
const PERSISTED_IDENTITY_KEY = 'royaraqamia:local-identity';

/**
 * Listeners for a change in this tab, so `useSyncExternalStore` can re-read the
 * snapshot. (A `storage` event covers the other tabs; this covers this one.)
 */
const listeners = new Set<() => void>();

/**
 * `localStorage`, or `null` where there is none — a server render, and a browser
 * in a mode that throws on access rather than answering `null` (a sandboxed
 * iframe, Safari's private mode in some versions). Every caller treats `null` as
 * "nothing remembered", which is the guest namespace.
 */
function browserStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** `guest`, `user:<id>`, or `null` for a value that is neither (another origin's, or corrupt). */
function parseIdentity(value: string | null): LocalIdentity | null {
  if (!value) return null;
  if (value === GUEST_IDENTITY) return GUEST_IDENTITY;
  if (!value.startsWith('user:')) return null;
  return value.length > 'user:'.length ? (value as LocalIdentity) : null;
}

/**
 * The identity to paint with before the session resolves, or `null` when this
 * device has never resolved one — a first visit, or a clean profile. Callers
 * fall back to {@link GUEST_IDENTITY}, which is the same namespace a first visit
 * writes into.
 */
export function readPersistedIdentity(
  storage: Storage | null = browserStorage()
): LocalIdentity | null {
  try {
    return parseIdentity(storage?.getItem(PERSISTED_IDENTITY_KEY) ?? null);
  } catch {
    return null;
  }
}

/**
 * Records the identity a session check just resolved — `guest` as well as a
 * user, so "signed out" is remembered too rather than being indistinguishable
 * from "never resolved".
 *
 * Called on every successful resolve, which is what keeps a stale value's
 * lifetime to one failed check instead of forever.
 */
export function persistIdentity(
  identity: LocalIdentity,
  storage: Storage | null = browserStorage()
): void {
  try {
    storage?.setItem(PERSISTED_IDENTITY_KEY, identity);
  } catch {
    // A full or unavailable store is not worth failing a paint over: the next
    // boot loses the head start, nothing else.
  }
  notifyPersistedIdentity();
}

/**
 * Forgets the identity, so the next boot paints the guest namespace. This is
 * the sign-out path (#493): a sign-out is a decision, not a failed check, and
 * the previous account's rows must not stay on screen behind a guest session.
 *
 * The rows themselves stay on disk (ADR-0028's "sign-out keeps the account
 * namespace", and `/device` is how they are removed); only the pointer to them
 * goes.
 */
export function clearPersistedIdentity(storage: Storage | null = browserStorage()): void {
  try {
    storage?.removeItem(PERSISTED_IDENTITY_KEY);
  } catch {
    // Same as `persistIdentity`: nothing here can fail a sign-out.
  }
  notifyPersistedIdentity();
}

/** Subscribes to changes made in this tab, for `useSyncExternalStore`. */
export function subscribeToPersistedIdentity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyPersistedIdentity(): void {
  for (const listener of listeners) listener();
}
