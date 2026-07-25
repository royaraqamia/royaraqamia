'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

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
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    supabaseRef.current = supabase;

    supabase.auth
      .getSession()
      .then(({ data: { session } }: { data: { session: Session | null } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

    if (supabaseRef.current) {
      supabaseRef.current.auth
        .getSession()
        .then(({ data: { session } }: { data: { session: Session | null } }) => {
          setSession(session);
          setUser(session?.user ?? null);
        });
    }
  }, [pathname]);

  const signOut = useCallback(async () => {
    if (!supabaseRef.current) return;
    await supabaseRef.current.auth.signOut();
  }, []);

  return (
    <SessionContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
