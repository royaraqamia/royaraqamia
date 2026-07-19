'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  const [supabaseClient, setSupabaseClient] = useState<ReturnType<typeof createClient> | null>(
    null
  );

  useEffect(() => {
    const supabase = createClient();
    setSupabaseClient(supabase);

    supabase.auth
      .getSession()
      .then(({ data: { session } }: { data: { session: Session | null } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        if (!session) {
          supabase.auth.getUser().then(({ data: { user } }: { data: { user: User | null } }) => {
            if (user) {
              setSession({ user, access_token: '' } as Session);
              setUser(user);
            }
          });
        }
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

  const signOut = useCallback(async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  }, [supabaseClient]);

  return (
    <SessionContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
