import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';

export const verifySession = cache(async () => {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect('/auth/login?redirect=/blogpress/app');
  }

  return { isAuth: true, userId: data.user.id, user: data.user };
});
