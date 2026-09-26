import 'server-only';

import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/backend/config/supabase';
import {
  createBlogpressAdminPostsModule,
  createBlogpressPostsModule,
} from '@/backend/config/blogpress';
import type { Post, PostAuthor, PostTag } from '@/shared/contracts/blogpress';
import { BLOG_TAGS } from '@/backend/shared/blog-cache-tags';

const BLOG_CACHE_SECONDS = 60;

const pub = () => createBlogpressPostsModule(getPublicSupabase()).repository;

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
    postTags: PostTag[];
  } | null> => {
    const repository = createBlogpressPostsModule(getPublicSupabase()).repository;

    const post = await repository.getPublishedPostBySlug(slug);
    if (!post) return null;

    const [author, postTags] = await Promise.all([
      createBlogpressAdminPostsModule().repository.getPostAuthor(post.author_id),
      repository.getPublishedPostTags(post.id),
    ]);

    return { post, author, postTags };
  },
  ['blog-post'],
  { revalidate: BLOG_CACHE_SECONDS, tags: [BLOG_TAGS.post] }
);
