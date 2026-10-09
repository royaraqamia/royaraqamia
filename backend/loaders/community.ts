import 'server-only';

import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/backend/config/supabase';
import {
  createBlogpressAdminPostsModule,
  createBlogpressPostsModule,
} from '@/backend/config/blogpress';
import { createPublicUsersRepositoryServer } from '@/backend/config/users';
import type { Post, PostAuthor, PostTag, PostSummary } from '@/shared/contracts/blogpress';
import type { PublicUser } from '@/shared/contracts/users';
import type { CommunitySearchResult } from '@/shared/contracts/community';
import { COMMUNITY_TAGS } from '@/backend/shared/community-cache-tags';

const COMMUNITY_CACHE_SECONDS = 60;

const pub = () => createBlogpressPostsModule(getPublicSupabase()).repository;

const COMMUNITY_MEMBERS_LIMIT = 50;
const COMMUNITY_SEARCH_PEOPLE_LIMIT = 5;
const COMMUNITY_SEARCH_POSTS_LIMIT = 6;
const COMMUNITY_MEMBER_POSTS_PAGE_SIZE = 9;

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

export const loadPublishedPostSitemapEntries = unstable_cache(
  () => pub().getPublishedPostSitemapEntries(),
  ['community-sitemap'],
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

/**
 * The "who's here" roster shown on `/community`. Shared by every visitor, so
 * it is cached under its own tag — publishing a post must not evict it.
 */
export const loadCommunityMembers = unstable_cache(
  async (limit: number = COMMUNITY_MEMBERS_LIMIT): Promise<PublicUser[]> =>
    createPublicUsersRepositoryServer().list(limit),
  ['community-members'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.members] }
);

/**
 * Combined people + post suggestions for the search combobox. Not cached: it is
 * keyed on the visitor's keystrokes and served on the request path.
 */
export async function loadCommunitySearch(query: string): Promise<CommunitySearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { people: [], posts: [] };

  const [people, feed] = await Promise.all([
    createPublicUsersRepositoryServer().search(trimmed, COMMUNITY_SEARCH_PEOPLE_LIMIT),
    pub().getPublishedFeed(null, trimmed, COMMUNITY_SEARCH_POSTS_LIMIT),
  ]);

  return { people, posts: feed.posts };
}

export interface CommunityMemberPage {
  member: PublicUser;
  posts: PostSummary[];
  nextCursor: string | null;
}

/** A public member profile plus the first page of their published posts. */
export const loadCommunityMember = unstable_cache(
  async (username: string): Promise<CommunityMemberPage | null> => {
    const member = await createPublicUsersRepositoryServer().getByUsername(username);
    if (!member) return null;

    const feed = await pub().getPublishedFeed(
      null,
      '',
      COMMUNITY_MEMBER_POSTS_PAGE_SIZE,
      undefined,
      member.id
    );
    const author = { name: member.name, avatar_url: member.avatar_url };

    return {
      member,
      posts: feed.posts.map((post) => ({ ...post, author })),
      nextCursor: feed.nextCursor,
    };
  },
  ['community-member'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.memberByUsername] }
);
