import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createBlogpressPostsService } from '@/backend/config/blogpress';
import type { Post, PostCategory, PostTag } from '@/shared/contracts/blogpress';

// The dashboard/editor pages fan out to several loader calls per render.
// cache() dedupes the async cookie-store read + Supabase client construction
// within a request, so one page render shares a single client instead of
// building one per loader call.
const getService = cache(async () => {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createBlogpressPostsService(supabase);
});

export async function loadBlogpressDashboard(
  userId: string,
  categorySlug?: string
): Promise<Post[]> {
  const service = await getService();
  return service.listPostsByAuthor(userId, categorySlug);
}

export async function loadEditorPost(id: string, userId: string): Promise<Post | null> {
  const service = await getService();
  return service.getPostForUser(id, userId);
}

export async function loadEditorPostTitle(id: string): Promise<string | null> {
  const service = await getService();
  return service.getPostTitleById(id);
}

export async function loadBlogCategories(authorId: string): Promise<PostCategory[]> {
  const service = await getService();
  return service.listCategoriesByAuthor(authorId);
}

export async function loadPostCategories(postId: string): Promise<PostCategory[]> {
  const service = await getService();
  return service.getPostCategories(postId);
}

export async function createBlogCategory(
  authorId: string,
  name: string,
  slug: string
): Promise<PostCategory> {
  const service = await getService();
  return service.createCategory(authorId, name, slug);
}

export async function deleteBlogCategory(categoryId: string, authorId: string): Promise<void> {
  const service = await getService();
  return service.deleteCategory(categoryId, authorId);
}

export async function setPostCategories(
  postId: string,
  authorId: string,
  categoryIds: string[]
): Promise<void> {
  const service = await getService();
  return service.setPostCategories(postId, authorId, categoryIds);
}

export async function setPostFeatured(
  postId: string,
  authorId: string,
  featured: boolean
): Promise<void> {
  const service = await getService();
  return service.setPostFeatured(postId, authorId, featured);
}

export async function loadBlogTags(authorId: string): Promise<PostTag[]> {
  const service = await getService();
  return service.listTagsByAuthor(authorId);
}

export async function loadPostTags(postId: string): Promise<PostTag[]> {
  const service = await getService();
  return service.getPostTags(postId);
}

export async function loadManyPostTags(postIds: string[]): Promise<Record<string, PostTag[]>> {
  const service = await getService();
  return service.getPostTagsByPostIds(postIds);
}
