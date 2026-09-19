import 'server-only';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { identity } from '@/backend/config/identity';
import type { AuthUser } from '@/backend/identity';

/**
 * The page guards ask the identity module; they no longer resolve identity
 * themselves. `getAuthUser` and `getOptionalUser` keep their signatures so
 * existing callers are unchanged.
 */

export async function getAuthUser(): Promise<{
  user: AuthUser | null;
  supabase: SupabaseClient<Database>;
}> {
  const { user, client } = await identity.resolveSession();
  return { user, supabase: client };
}

export async function requireAuth(redirectPath: string) {
  const { user, supabase } = await getAuthUser();
  if (!user) redirect(redirectPath);
  return { user, supabase };
}

export async function getOptionalUser(): Promise<{
  user: AuthUser | null;
  client: SupabaseClient<Database> | null;
}> {
  return identity.resolveOptional();
}
