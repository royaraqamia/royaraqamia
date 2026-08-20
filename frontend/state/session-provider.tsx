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
import {
  getSession,
  subscribeToSessionChanges,
  signOutSession,
  type Session,
  type User,
} from '@/frontend/api/auth';
import { hasBrowserSessionToken } from '@/frontend/transport/supabase/client';

interface SessionContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType>({
  user: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
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
  const pathname = usePathname();
  const router = useRouter();
  const prevSessionRef = useRef<Session | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    let active = true;

    if (!hasBrowserSessionToken()) {
      setIsLoading(false);
      return;
    }

    getSession().then((session) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      prevSessionRef.current = session;
    });

    const unsubscribe = subscribeToSessionChanges((session) => {
      if (!active) return;
      const prevSession = prevSessionRef.current;
      prevSessionRef.current = session;
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      // Session expired (had a session, now null) — not on an auth page
      if (prevSession && !session && !AUTH_PATHS.some((p) => pathnameRef.current.startsWith(p))) {
        const currentPath = pathnameRef.current;
        const loginPath =
          currentPath && currentPath !== '/'
            ? `/auth/login?session_expired=1&redirect=${encodeURIComponent(currentPath)}`
            : '/auth/login?session_expired=1';
        router.push(loginPath);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  const signOut = useCallback(async () => {
    await signOutSession();
  }, []);

  const value = useMemo(
    () => ({ user, session, isLoading, signOut }),
    [user, session, isLoading, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
