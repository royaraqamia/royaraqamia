import 'server-only';

import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/backend/config/supabase';
import {
  createBlogpressAdminPostsModule,
  createBlogpressPostsModule,
} from '@/backend/config/blogpress';
import type { Post, PostAuthor, PostTag } from '@/shared/contracts/blogpress';
import { COMMUNITY_TAGS } from '@/backend/shared/community-cache-tags';

const COMMUNITY_CACHE_SECONDS = 60;

const pub = () => createBlogpressPostsModule(getPublicSupabase()).repository;

export const loadCommunityIndex = unstable_cache(
  (page: number, query: string, pageSize: number, categorySlug?: string) =>
    pub().getPublishedPosts(page, query, pageSize, categorySlug),
  ['community-index'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.index] }
);

export const loadPublishedPostSlugs = unstable_cache(
  () => pub().getPublishedPostSlugs(),
  ['community-slugs'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.slugs] }
);

export const loadPublishedCategories = unstable_cache(
  () => pub().getPublishedCategories(),
  ['community-categories'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.categories] }
);

export const loadPublishedPostCategories = unstable_cache(
  (postId: string) => pub().getPublishedPostCategories(postId),
  ['community-post-categories'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.postCategories] }
);

export const loadPublishedPostBySlug = unstable_cache(
  (slug: string) => pub().getPublishedPostBySlug(slug),
  ['community-post-by-slug'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.postBySlug] }
);

export const loadCommunityPost = unstable_cache(
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
  ['community-post'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.post] }
);
