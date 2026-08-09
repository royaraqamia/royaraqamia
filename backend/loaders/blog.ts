import 'server-only';

import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/backend/config/supabase';
import {
  createBlogpressAdminPostsService,
  createBlogpressPostsService,
} from '@/backend/config/blogpress';
import type { Post, PostCategory, PostTag, PostAuthor } from '@/shared/contracts/blogpress';

const BLOG_CACHE_SECONDS = 60;

const pub = () => createBlogpressPostsService(getPublicSupabase());

export const loadBlogIndex = unstable_cache(
  (page: number, query: string, pageSize: number, categorySlug?: string) =>
    pub().getPublishedPosts(page, query, pageSize, categorySlug),
  ['blog-index'],
  { revalidate: BLOG_CACHE_SECONDS }
);

export const loadPublishedPostSlugs = unstable_cache(
  () => pub().getPublishedPostSlugs(),
  ['blog-slugs'],
  { revalidate: BLOG_CACHE_SECONDS }
);

export async function loadPublishedCategories(): Promise<PostCategory[]> {
  return pub().getPublishedCategories();
}

export async function loadPublishedPostCategories(postId: string): Promise<PostCategory[]> {
  return pub().getPublishedPostCategories(postId);
}

export async function loadPublishedPostTags(postId: string): Promise<PostTag[]> {
  return pub().getPublishedPostTags(postId);
}

export async function loadIncrementPostViewCount(postId: string): Promise<void> {
  return pub().incrementPostViewCount(postId);
}

export async function loadPublishedPostBySlug(slug: string): Promise<Post | null> {
  return pub().getPublishedPostBySlug(slug);
}

export const loadBlogPost = unstable_cache(
  async (
    slug: string
  ): Promise<{
    post: Post;
    author: PostAuthor | null;
    relatedPosts: Post[];
  } | null> => {
    const supabase = getPublicSupabase();
    const postsService = createBlogpressPostsService(supabase);

    const post = await postsService.getPublishedPostBySlug(slug);
    if (!post) return null;

    const [author, relatedPosts] = await Promise.all([
      createBlogpressAdminPostsService().getPostAuthor(post.author_id),
      postsService.getRelatedPosts(slug),
    ]);

    return { post, author, relatedPosts };
  },
  ['blog-post'],
  { revalidate: BLOG_CACHE_SECONDS }
);
