import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const getAuthUser = cache(async () => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
});

export async function requireAuth() {
  const { user } = await getAuthUser();
  if (!user) redirect('/auth/login?redirect=/spendtrack');
  return user;
}
