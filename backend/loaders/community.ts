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
  async (cursor: string | null, query: string, pageSize: number, categorySlug?: string) => {
    const feed = await pub().getPublishedFeed(cursor, query, pageSize, categorySlug);

    // `users` is not readable by the anon client the feed runs on, so publishers
    // are joined with the service-role repository and projected down to the
    // public identity only (name + avatar).
    const authorIds = [...new Set(feed.posts.map((post) => post.author_id))];
    const authors = await createBlogpressAdminPostsModule().repository.getPostAuthors(authorIds);

    return {
      posts: feed.posts.map((post) => ({
        ...post,
        author: authors[post.author_id] ?? null,
      })),
      nextCursor: feed.nextCursor,
    };
  },
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
