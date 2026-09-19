import 'server-only';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { identity } from '@/backend/identity/server';

/**
 * The page guards ask the identity module; they no longer resolve identity
 * themselves. `getAuthUser` and `getOptionalUser` keep their signatures so
 * existing callers are unchanged.
 */

export async function getAuthUser(): Promise<{
  user: { id: string; email?: string } | null;
  supabase: SupabaseClient<Database>;
}> {
  const { user, client } = await identity.resolveSession();
  return { user, supabase: client as SupabaseClient<Database> };
}

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
  client: SupabaseClient<Database> | null;
}> {
  return identity.resolveOptional();
}
