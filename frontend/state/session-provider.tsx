'use client';

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { hasBrowserSessionToken } from '@/frontend/transport/supabase/client';
import { warmRealtimeSocket } from '@/frontend/transport/supabase/warm';
import { purgeServiceWorkerCaches } from '@/frontend/shared/cache-maintenance';
import { refreshPlanLimits, clearPlanLimits } from '@/frontend/shared/plans/plan-limits';
import {
  GUEST_IDENTITY,
  clearPersistedIdentity,
  persistIdentity,
  readPersistedIdentity,
  userIdentity,
} from '@/frontend/shared/local-store/identity';
import { clearSnapshots } from '@/frontend/shared/local-store/snapshot';
import { sessionInitialState, sessionReducer } from '@/frontend/state/session-provider.reducer';
import {
  ASSISTANT_DEFAULT_NAME,
  type AssistantVoice,
} from '@/shared/contracts/assistant-identity-constants';
import type { Session, User } from '@supabase/supabase-js';

// Auth machinery is loaded lazily so the auth wrapper module stays out of the
// initial JS graph of every route; the runtime flow (cookie check → load) is
// identical to before.
type AuthApi = typeof import('@/frontend/api/auth');

interface SessionContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  /** Display name from the user's profile row, or null when unavailable. */
  profileName: string | null;
  /** Avatar URL from the user's profile row, or null when unavailable. */
  profileAvatarUrl: string | null;
  /** Public handle from the user's profile row, or null when unavailable. */
  profileUsername: string | null;
  /** Public-profile bio from the user's profile row, or null when unavailable. */
  profileBio: string | null;
  /**
   * The name the member gave their assistant, resolved to the deployment default
   * (ADR-0229). Every label that names the assistant reads this one string.
   */
  assistantName: string;
  /** How the assistant is addressed; the site's copy follows it where it must. */
  assistantVoice: AssistantVoice;
  /** The member's uploaded face, or null for the orb. */
  assistantAvatarUrl: string | null;
  signOut: () => Promise<void>;
  /** Re-read the profile row after an edit so the UI reflects it immediately. */
  refreshProfile: () => Promise<void>;
  /** Re-read the assistant identity after an edit so every label follows it. */
  refreshAssistantIdentity: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType>({
  user: null,
  session: null,
  isLoading: true,
  isAdmin: false,
  profileName: null,
  profileAvatarUrl: null,
  profileUsername: null,
  profileBio: null,
  assistantName: ASSISTANT_DEFAULT_NAME,
  assistantVoice: 'feminine',
  assistantAvatarUrl: null,
  signOut: async () => {},
  refreshProfile: async () => {},
  refreshAssistantIdentity: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

const AUTH_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/auth/verify-otp',
  '/auth/reset-password',
  '/auth/update-password',
];

/**
 * Records the identity a session check just resolved, so the next boot can open
 * that Local Store before this work runs again (#493).
 *
 * A "nobody" answer does **not** overwrite a remembered account: an expired
 * session, or a cookie the browser dropped, is not a sign-out, and the products
 * keep painting the last-known rows read-only rather than swapping the guest
 * namespace in under them (ADR-0031). Sign-out is the decision that clears the
 * pointer, and both of its paths do so explicitly — `signOutSession()`,
 * `logout()`, and the expiry branch below.
 */
function rememberResolvedIdentity(user: User | null): void {
  if (user?.id) {
    persistIdentity(userIdentity(user.id));
    return;
  }
  if (readPersistedIdentity() === null) persistIdentity(GUEST_IDENTITY);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, sessionInitialState);
  const pathname = usePathname();
  const router = useRouter();
  const prevSessionRef = useRef<Session | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    if (!hasBrowserSessionToken()) {
      // No cookie: the browser is not holding a session at all. Nothing to
      // check, so the boot identity is already the answer.
      rememberResolvedIdentity(null);
      dispatch({ type: 'sessionAbsent' });
      return;
    }

    void import('@/frontend/api/auth').then(({ getSession, subscribeToSessionChanges }) => {
      if (!active) return;

      getSession()
        .then((session) => {
          if (!active) return;
          dispatch({ type: 'resolved', session });
          prevSessionRef.current = session;
          rememberResolvedIdentity(session?.user ?? null);
        })
        .catch(() => {
          // A check that could not answer is not a sign-out: leave the
          // remembered identity alone so its rows stay on screen (ADR-0031),
          // and stop reporting "still loading" so nothing waits on it.
          if (active) dispatch({ type: 'loadFailed' });
        });

      unsubscribe = subscribeToSessionChanges((session) => {
        if (!active) return;
        const prevSession = prevSessionRef.current;
        prevSessionRef.current = session;
        dispatch({ type: 'resolved', session });

        // Session expired (had a session, now null) — not on an auth page
        if (prevSession && !session) {
          clearPlanLimits(prevSession.user.id);
          // The account is gone: no Local Store of it may paint behind a guest
          // session, and the expiry sends the page to the login form anyway —
          // the last screens it painted go with the pointer (#495).
          clearPersistedIdentity();
          clearSnapshots();
          // An expiry is a sign-out the user did not perform: the cached renders
          // may still belong to the account that just lost its session.
          void purgeServiceWorkerCaches();
          // The presence topics are the tab's, not a screen's (ADR-0171): their
          // grace window is for a route change, so an identity change closes
          // them here rather than leaving a joined channel behind.
          void import('@/frontend/state/chats/presence-channels').then(({ closeAllChatPresence }) =>
            closeAllChatPresence()
          );
          if (!AUTH_PATHS.some((p) => pathnameRef.current.startsWith(p))) {
            const currentPath = pathnameRef.current;
            const loginPath =
              currentPath && currentPath !== '/'
                ? `/auth/login?session_expired=1&redirect=${encodeURIComponent(currentPath)}`
                : '/auth/login?session_expired=1';
            router.push(loginPath);
          }
          return;
        }

        rememberResolvedIdentity(session?.user ?? null);
      });
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [router]);

  const signOut = useCallback(async () => {
    const { signOutSession } = (await import('@/frontend/api/auth')) as AuthApi;
    await signOutSession();
  }, []);

  // The Admin allowlist never leaves the server; only this boolean crosses to the
  // client. Keyed on the user id so a token refresh doesn't re-probe, and defaulted
  // to `false` so a failure can only hide the entry — never expose it. The same
  // response carries the profile display name, so this costs no extra round-trip.
  const userId = state.session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      dispatch({ type: 'profileCleared' });
      return;
    }

    let active = true;

    void import('@/frontend/api/me').then(({ getMe }) =>
      getMe()
        .then((me) => {
          if (active) dispatch({ type: 'profileLoaded', profile: me });
        })
        .catch(() => {
          if (active) dispatch({ type: 'profileCleared' });
        })
    );

    return () => {
      active = false;
    };
  }, [userId]);

  // The assistant's name, face and voice are read once for the session, not per
  // surface (ADR-0229): the panel, the chats row, the account door and the
  // memory page all paint the member's own name, and each one asking would be
  // the same no-store read repeated. A signed-out reader gets the default.
  useEffect(() => {
    if (!userId) {
      dispatch({ type: 'assistantCleared' });
      return;
    }

    let active = true;

    void import('@/frontend/api/assistant-identity').then(({ getAssistantIdentity }) =>
      getAssistantIdentity()
        .then((result) => {
          if (!active) return;
          if (result.success && result.identity) {
            dispatch({ type: 'assistantLoaded', identity: result.identity });
          } else {
            dispatch({ type: 'assistantCleared' });
          }
        })
        .catch(() => {
          // Keep the default name rather than turning every label into an error.
          if (active) dispatch({ type: 'assistantCleared' });
        })
    );

    return () => {
      active = false;
    };
  }, [userId]);

  // The Realtime socket is the session's, not a screen's (ADR-0169). Opening it
  // as soon as the member is known is what makes the first thread they open
  // join a live socket instead of paying a handshake on a keystroke; a guest
  // opens nothing. Deferred and idempotent — see `warmRealtimeSocket`.
  useEffect(() => {
    if (userId) warmRealtimeSocket();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // The plan caps and allowance, cached for the offline create checks, plus
    // whatever this device counted while it was away. A refresh on `online`
    // keeps them current without a poll.
    const refresh = () => {
      void refreshPlanLimits(userId);
    };
    refresh();
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [userId]);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    try {
      const { getMe } = await import('@/frontend/api/me');
      dispatch({ type: 'profileLoaded', profile: await getMe() });
    } catch {
      // Keep the last known values when a refresh fails.
    }
  }, [userId]);

  const refreshAssistantIdentity = useCallback(async () => {
    if (!userId) return;
    try {
      const { getAssistantIdentity } = await import('@/frontend/api/assistant-identity');
      const result = await getAssistantIdentity();
      if (result.success && result.identity) {
        dispatch({ type: 'assistantLoaded', identity: result.identity });
      }
    } catch {
      // Same rule as the profile: the last known name survives a failed refresh.
    }
  }, [userId]);

  const value = useMemo(
    () => ({
      user: state.user,
      session: state.session,
      isLoading: state.isLoading,
      isAdmin: state.isAdmin,
      profileName: state.profileName,
      profileAvatarUrl: state.profileAvatarUrl,
      profileUsername: state.profileUsername,
      profileBio: state.profileBio,
      assistantName: state.assistantName ?? ASSISTANT_DEFAULT_NAME,
      assistantVoice: state.assistantVoice,
      assistantAvatarUrl: state.assistantAvatarUrl,
      signOut,
      refreshProfile,
      refreshAssistantIdentity,
    }),
    [state, signOut, refreshProfile, refreshAssistantIdentity]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
