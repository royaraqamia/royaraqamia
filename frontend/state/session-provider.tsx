'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  getSession,
  subscribeToSessionChanges,
  signOutSession,
  type Session,
  type User,
} from '@/frontend/api/auth';

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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    getSession().then((session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const unsubscribe = subscribeToSessionChanges((session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

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
