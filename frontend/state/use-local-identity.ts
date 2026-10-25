'use client';

import { useSyncExternalStore } from 'react';
import { useSession } from '@/frontend/state/session-provider';
import {
  GUEST_IDENTITY,
  readPersistedIdentity,
  subscribeToPersistedIdentity,
  userIdentity,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';

/**
 * Which identity's Local Store a surface paints with (#493).
 *
 * The bug this closes is a serial chain: HTML → hydrate → dynamic auth import →
 * cookie check → `getSession()` → _then_ mount the shell → _then_ open IndexedDB
 * → paint. The rows are on disk the whole time; only the answer to "whose rows"
 * was missing, and it is now persisted (`frontend/shared/local-store/identity`).
 *
 * So the order is inverted: {@link LocalIdentityState.identity} is available on
 * the first client render, and the session check runs in parallel and
 * reconciles. Two properties matter and both are why this is a hook rather than
 * a `localStorage.getItem` at each call site:
 *
 *   * **The identity does not flap.** It is `user:<id>` from the persisted value
 *     *and* from the session once that lands, so the store opens once. A store
 *     effect keyed on `[identity]` therefore never reopens mid-read — which is
 *     the Quran reader's guest-flash and position reset.
 *   * **A failed check is not a sign-out.** A session that resolves to "nobody"
 *     while an account was remembered leaves the last-known rows on screen
 *     (`isUnconfirmed`) instead of silently swapping the guest namespace in
 *     (ADR-0031's needs-connection). Only `clearPersistedIdentity` — which both
 *     sign-out paths call — moves a device back to guest.
 *
 * `isLoading` stays available for account-only affordances (the admin entry, the
 * profile menu, a write that needs a credential). It must never gate the list.
 */
export interface LocalIdentityState {
  /** The partition to open. Never null: a first visit is a guest visit. */
  identity: LocalIdentity;
  /**
   * The **session's** account id, or null while it is unresolved or absent.
   * Deliberately not the identity's id: a remembered-but-unconfirmed identity
   * names a namespace, it does not prove a credential. Callers that need the
   * namespace's id use `identityUserId(identity)`.
   */
  sessionUserId: string | null;
  /** The session check has not answered yet. Gates credentials, never rows. */
  isLoading: boolean;
  /**
   * The session answered "nobody", but this device remembers an account — an
   * expired session, or a check that could not reach the network. The rows stay
   * visible and should be presented as read-only until the session returns.
   */
  isUnconfirmed: boolean;
}

/** There is no `localStorage` during the server render, so nothing is remembered. */
function serverIdentity(): LocalIdentity | null {
  return null;
}

export function useLocalIdentity(): LocalIdentityState {
  const { user, isLoading } = useSession();

  // `useSyncExternalStore` rather than `useState(initializer)`: the server
  // render has no storage, so an initializer would answer `null` on the
  // hydrating render and only correct itself in an effect — one frame of guest
  // store, which is the flash this closes. With a server snapshot of `null`,
  // React uses it for hydration and re-reads the real value before the effects
  // that open a store.
  const persisted = useSyncExternalStore(
    subscribeToPersistedIdentity,
    readPersistedIdentity,
    serverIdentity
  );

  const sessionIdentity = user ? userIdentity(user.id) : null;
  const identity = sessionIdentity ?? persisted ?? GUEST_IDENTITY;

  return {
    identity,
    sessionUserId: user?.id ?? null,
    isLoading,
    isUnconfirmed:
      !isLoading && !sessionIdentity && persisted !== null && persisted !== GUEST_IDENTITY,
  };
}
