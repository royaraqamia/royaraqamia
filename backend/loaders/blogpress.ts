import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createBlogpressPostsModule, type BlogpressPostsModule } from '@/backend/config/blogpress';

// The dashboard/editor pages fan out to several reads per render. cache()
// dedupes the async cookie-store read + Supabase client construction within a
// request, so one page render shares a single client (and the module and
// repository built on it) instead of building one per read.
export const getBlogpressPosts = cache(async (): Promise<BlogpressPostsModule> => {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsModule(supabase);
});
