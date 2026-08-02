import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/backend/transport/supabase/server';

export const getAuthUser = cache(async () => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
});

export async function requireAuth(redirectPath: string) {
  const { user, supabase } = await getAuthUser();
  if (!user) redirect(redirectPath);
  return { user, supabase };
}

interface AuthenticatedUser {
  id: string;
  email?: string;
}

export async function getOptionalUser(): Promise<{
  user: AuthenticatedUser | null;
  client: SupabaseClient | null;
}> {
  try {
    const supabase = await createClient();
    if (!supabase) return { user: null, client: null };
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return { user: null, client: null };
    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? undefined,
      },
      client: supabase,
    };
  } catch {
    return { user: null, client: null };
  }
}
