import 'server-only';

import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createBlogpressPostsService } from '@/backend/config/blogpress';
import type { Post } from '@/shared/contracts/blogpress';

export async function loadBlogpressDashboard(userId: string): Promise<Post[]> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).listPostsByAuthor(userId);
}

export async function loadEditorPost(id: string, userId: string): Promise<Post | null> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPostForUser(id, userId);
}

export async function loadEditorPostTitle(id: string): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPostTitleById(id);
}
