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
      setIsLoading(false);
      return;
    }

    void import('@/frontend/api/auth').then(({ getSession, subscribeToSessionChanges }) => {
      if (!active) return;

      getSession().then((session) => {
        if (!active) return;
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
        prevSessionRef.current = session;
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
        }
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
