import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/backend/transport/supabase/server';

export const getAuthUser = cache(async () => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
});
