import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export const verifySession = cache(async () => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect('/auth/login?redirect=/blogpress');
  }

  return { isAuth: true, userId: data.user.id, user: data.user };
});
