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
