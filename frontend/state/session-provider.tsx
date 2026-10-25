'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { hasBrowserSessionToken } from '@/frontend/transport/supabase/client';
import { purgeServiceWorkerCaches } from '@/frontend/shared/cache-maintenance';
import { refreshPlanLimits, clearPlanLimits } from '@/frontend/shared/plans/plan-limits';
import {
  GUEST_IDENTITY,
  clearPersistedIdentity,
  persistIdentity,
  readPersistedIdentity,
  userIdentity,
} from '@/frontend/shared/local-store/identity';
import { clearIdentitySnapshots } from '@/frontend/shared/local-store/snapshot';
import type { Me } from '@/frontend/api/me';
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
  signOut: () => Promise<void>;
  /** Re-read the profile row after an edit so the UI reflects it immediately. */
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType>({
  user: null,
  session: null,
  isLoading: true,
  isAdmin: false,
  profileName: null,
  profileAvatarUrl: null,
  profileUsername: null,
  signOut: async () => {},
  refreshProfile: async () => {},
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
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
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
      setIsLoading(false);
      return;
    }

    void import('@/frontend/api/auth').then(({ getSession, subscribeToSessionChanges }) => {
      if (!active) return;

      getSession()
        .then((session) => {
          if (!active) return;
          setSession(session);
          setUser(session?.user ?? null);
          setIsLoading(false);
          prevSessionRef.current = session;
          rememberResolvedIdentity(session?.user ?? null);
        })
        .catch(() => {
          // A check that could not answer is not a sign-out: leave the
          // remembered identity alone so its rows stay on screen (ADR-0031),
          // and stop reporting "still loading" so nothing waits on it.
          if (active) setIsLoading(false);
        });

      unsubscribe = subscribeToSessionChanges((session) => {
        if (!active) return;
        const prevSession = prevSessionRef.current;
        prevSessionRef.current = session;
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        // Session expired (had a session, now null) — not on an auth page
        if (prevSession && !session) {
          clearPlanLimits(prevSession.user.id);
          // The account is gone: no Local Store of it may paint behind a guest
          // session, and the expiry sends the page to the login form anyway —
          // the last screens it painted go with the pointer (#495).
          clearPersistedIdentity();
          clearIdentitySnapshots();
          // An expiry is a sign-out the user did not perform: the cached renders
          // may still belong to the account that just lost its session.
          void purgeServiceWorkerCaches();
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
  const userId = session?.user?.id ?? null;

  const applyMe = useCallback((me: Me) => {
    setIsAdmin(me.isAdmin);
    setProfileName(me.name ?? null);
    setProfileAvatarUrl(me.avatarUrl ?? null);
    setProfileUsername(me.username ?? null);
  }, []);

  const clearProfile = useCallback(() => {
    setIsAdmin(false);
    setProfileName(null);
    setProfileAvatarUrl(null);
    setProfileUsername(null);
  }, []);

  useEffect(() => {
    if (!userId) {
      clearProfile();
      return;
    }

    let active = true;

    void import('@/frontend/api/me').then(({ getMe }) =>
      getMe()
        .then((me) => {
          if (active) applyMe(me);
        })
        .catch(() => {
          if (active) clearProfile();
        })
    );

    return () => {
      active = false;
    };
  }, [userId, applyMe, clearProfile]);

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
      applyMe(await getMe());
    } catch {
      // Keep the last known values when a refresh fails.
    }
  }, [userId, applyMe]);

  const value = useMemo(
    () => ({
      user,
      session,
      isLoading,
      isAdmin,
      profileName,
      profileAvatarUrl,
      profileUsername,
      signOut,
      refreshProfile,
    }),
    [
      user,
      session,
      isLoading,
      isAdmin,
      profileName,
      profileAvatarUrl,
      profileUsername,
      signOut,
      refreshProfile,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
