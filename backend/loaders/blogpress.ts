import 'server-only';

import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createBlogpressPostsService } from '@/backend/config/blogpress';
import type { Post, PostCategory, PostTag } from '@/shared/contracts/blogpress';

export async function loadBlogpressDashboard(
  userId: string,
  categorySlug?: string
): Promise<Post[]> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).listPostsByAuthor(userId, categorySlug);
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

export async function loadBlogCategories(authorId: string): Promise<PostCategory[]> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).listCategoriesByAuthor(authorId);
}

export async function loadPostCategories(postId: string): Promise<PostCategory[]> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPostCategories(postId);
}

export async function createBlogCategory(
  authorId: string,
  name: string,
  slug: string
): Promise<PostCategory> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).createCategory(authorId, name, slug);
}

export async function deleteBlogCategory(categoryId: string, authorId: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).deleteCategory(categoryId, authorId);
}

export async function setPostCategories(
  postId: string,
  authorId: string,
  categoryIds: string[]
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).setPostCategories(postId, authorId, categoryIds);
}

export async function setPostFeatured(
  postId: string,
  authorId: string,
  featured: boolean
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).setPostFeatured(postId, authorId, featured);
}

export async function loadBlogTags(authorId: string): Promise<PostTag[]> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).listTagsByAuthor(authorId);
}

export async function loadPostTags(postId: string): Promise<PostTag[]> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase).getPostTags(postId);
}

export async function loadManyPostTags(postIds: string[]): Promise<Record<string, PostTag[]>> {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  const service = createBlogpressPostsService(supabase);
  const results = await Promise.all(postIds.map((id) => service.getPostTags(id)));
  return Object.fromEntries(postIds.map((id, i) => [id, results[i] ?? []]));
}
