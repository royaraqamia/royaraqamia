import 'server-only';

import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import {
  createBlogpressAdminPostsService,
  createBlogpressPostsService,
} from '@/backend/config/blogpress';
import type {
  PublishedPostsResult,
  PostAuthor,
} from '@/backend/repositories/blogpress/posts-repository';
import type { Post } from '@/shared/contracts/blogpress';

export async function loadBlogIndex(
  page: number,
  query: string,
  pageSize: number
): Promise<PublishedPostsResult> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPublishedPosts(page, query, pageSize);
}

export async function loadPublishedPostBySlug(slug: string): Promise<Post | null> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPublishedPostBySlug(slug);
}

export async function loadBlogPost(slug: string): Promise<{
  post: Post;
  author: PostAuthor | null;
  relatedPosts: Post[];
} | null> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  const postsService = createBlogpressPostsService(supabase);

  const post = await postsService.getPublishedPostBySlug(slug);
  if (!post) return null;

  const [author, relatedPosts] = await Promise.all([
    createBlogpressAdminPostsService().getPostAuthor(post.author_id),
    postsService.getRelatedPosts(slug),
  ]);

  return { post, author, relatedPosts };
}
