import 'server-only';

import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import {
  createBlogpressAdminPostsService,
  createBlogpressPostsService,
} from '@/backend/config/blogpress';
import type {
  Post,
  PostCategory,
  PostTag,
  PostAuthor,
  PublishedPostsResult,
} from '@/shared/contracts/blogpress';

export async function loadBlogIndex(
  page: number,
  query: string,
  pageSize: number,
  categorySlug?: string
): Promise<PublishedPostsResult> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPublishedPosts(
    page,
    query,
    pageSize,
    categorySlug
  );
}

export async function loadPublishedCategories(): Promise<PostCategory[]> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPublishedCategories();
}

export async function loadPublishedPostCategories(postId: string): Promise<PostCategory[]> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPublishedPostCategories(postId);
}

export async function loadPublishedPostTags(postId: string): Promise<PostTag[]> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPublishedPostTags(postId);
}

export async function loadIncrementPostViewCount(postId: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).incrementPostViewCount(postId);
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
