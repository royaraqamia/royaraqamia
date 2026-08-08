'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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

  useEffect(() => {
    if (!hasBrowserSessionToken()) {
      setIsLoading(false);
      return;
    }

    getSession().then((session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      prevSessionRef.current = session;
    });

    const unsubscribe = subscribeToSessionChanges((session) => {
      const prevSession = prevSessionRef.current;
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      prevSessionRef.current = session;

      // Session expired (had a session, now null) — not on an auth page
      if (prevSession && !session && !AUTH_PATHS.some((p) => pathname.startsWith(p))) {
        router.push('/auth/login?session_expired=1');
      }
    });

    return unsubscribe;
  }, [pathname, router]);

  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

    if (!hasBrowserSessionToken()) return;

    getSession().then((session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });
  }, [pathname]);

  const signOut = useCallback(async () => {
    await signOutSession();
  }, []);

  return (
    <SessionContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
