import 'server-only';

import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/backend/config/supabase';
import {
  createBlogpressAdminPostsService,
  createBlogpressPostsService,
} from '@/backend/config/blogpress';
import type { Post, PostSummary, PostAuthor, PostTag } from '@/shared/contracts/blogpress';
import { BLOG_TAGS } from '@/backend/shared/blog-cache-tags';

const BLOG_CACHE_SECONDS = 60;

const pub = () => createBlogpressPostsService(getPublicSupabase());

export const loadBlogIndex = unstable_cache(
  (page: number, query: string, pageSize: number, categorySlug?: string) =>
    pub().getPublishedPosts(page, query, pageSize, categorySlug),
  ['blog-index'],
  { revalidate: BLOG_CACHE_SECONDS, tags: [BLOG_TAGS.index] }
);

export const loadPublishedPostSlugs = unstable_cache(
  () => pub().getPublishedPostSlugs(),
  ['blog-slugs'],
  { revalidate: BLOG_CACHE_SECONDS, tags: [BLOG_TAGS.slugs] }
);

export const loadPublishedCategories = unstable_cache(
  () => pub().getPublishedCategories(),
  ['blog-categories'],
  { revalidate: BLOG_CACHE_SECONDS, tags: [BLOG_TAGS.categories] }
);

export const loadPublishedPostCategories = unstable_cache(
  (postId: string) => pub().getPublishedPostCategories(postId),
  ['blog-post-categories'],
  { revalidate: BLOG_CACHE_SECONDS, tags: [BLOG_TAGS.postCategories] }
);

export async function loadIncrementPostViewCount(postId: string): Promise<void> {
  return pub().incrementPostViewCount(postId);
}

export const loadPublishedPostBySlug = unstable_cache(
  (slug: string) => pub().getPublishedPostBySlug(slug),
  ['blog-post-by-slug'],
  { revalidate: BLOG_CACHE_SECONDS, tags: [BLOG_TAGS.postBySlug] }
);

export const loadBlogPost = unstable_cache(
  async (
    slug: string
  ): Promise<{
    post: Post;
    author: PostAuthor | null;
    relatedPosts: PostSummary[];
    postTags: PostTag[];
  } | null> => {
    const supabase = getPublicSupabase();
    const postsService = createBlogpressPostsService(supabase);

    const post = await postsService.getPublishedPostBySlug(slug);
    if (!post) return null;

    const [author, relatedPosts, postTags] = await Promise.all([
      createBlogpressAdminPostsService().getPostAuthor(post.author_id),
      postsService.getRelatedPosts(slug),
      postsService.getPublishedPostTags(post.id),
    ]);

    return { post, author, relatedPosts, postTags };
  },
  ['blog-post'],
  { revalidate: BLOG_CACHE_SECONDS, tags: [BLOG_TAGS.post] }
);
