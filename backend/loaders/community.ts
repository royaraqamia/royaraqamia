import 'server-only';

import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/backend/config/supabase';
import {
  createBlogpressAdminPostsModule,
  createBlogpressPostsModule,
} from '@/backend/config/blogpress';
import { createPublicUsersRepositoryServer } from '@/backend/config/users';
import type { Post, PostAuthor, PostTag, PostSummary } from '@/shared/contracts/blogpress';
import type { MemberProfile, PublicUser } from '@/shared/contracts/users';
import type { CommunitySearchResult } from '@/shared/contracts/community';
import { COMMUNITY_TAGS } from '@/backend/shared/community-cache-tags';

const COMMUNITY_CACHE_SECONDS = 300;

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
 * How many distinct published authors the product needs before the roster may
 * show members who have not written anything (#1952).
 *
 * On the audit's evidence the hub listed nineteen follow buttons while one
 * account had ever published. An empty follow list is not what a reader is
 * missing; something to read is. Until the supply clears this floor, the roster
 * is drawn from the accounts that produced it.
 */
export const COMMUNITY_ROSTER_AUTHOR_FLOOR = 3;

/**
 * The roster a page may draw, from the roster read and the supply read (#1952).
 *
 * Pure and exported so the rule is asserted without a database: below the floor
 * only authors remain, at or above it the whole directory returns, and no
 * authors at all returns nothing (the page omits the roster).
 */
export function rosterForSupply<T extends { id: string }>(
  members: T[],
  publishedAuthorIds: string[]
): T[] {
  const authors = new Set(publishedAuthorIds);
  if (authors.size >= COMMUNITY_ROSTER_AUTHOR_FLOOR) return members;
  return members.filter((member) => authors.has(member.id));
}

/**
 * The "who's here" roster shown on `/community` and `/community/explore`.
 *
 * It is a consequence of supply, not a directory of sign-ups (#1952): while the
 * product has fewer than three distinct authors, it lists only accounts that
 * have published a post, so the page never asks a reader to follow someone with
 * nothing to read. At three authors the full directory returns, because by then
 * the follow control has something behind it.
 *
 * Shared by every visitor, so it is cached under its own tags. The viewer's own
 * row is pinned to the head in the browser, from the session, never here
 * (ADR-0172).
 */
export const loadCommunityMembers = unstable_cache(
  async (limit: number = COMMUNITY_MEMBERS_LIMIT): Promise<PublicUser[]> => {
    const [members, publishedAuthorIds] = await Promise.all([
      createPublicUsersRepositoryServer().list(limit),
      pub().getPublishedAuthorIds(),
    ]);

    return rosterForSupply(members, publishedAuthorIds);
  },
  ['community-members'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.members, COMMUNITY_TAGS.index] }
);

/**
 * Every verified handle, for `sitemap.ts`. The roster's 50 is a display cap, so
 * the sitemap cannot reuse it; 50,000 is the protocol's own per-file URL ceiling.
 */
export const loadCommunityMemberHandles = unstable_cache(
  (): Promise<string[]> => createPublicUsersRepositoryServer().listVerifiedHandles(50_000),
  ['community-member-handles'],
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
  member: MemberProfile;
  posts: PostSummary[];
  nextCursor: string | null;
}

/**
 * A public member profile plus the first page of their published posts.
 *
 * A hidden member (ADR-0127) stops here, returning `null`: this loader feeds a
 * cached page, so its answer cannot depend on who is asking, and "absent" is
 * what every other public read already says about the row. The row itself is
 * still readable by handle — the uniqueness check and an existing chat thread
 * need it — but not through this door.
 */
export const loadCommunityMember = unstable_cache(
  async (username: string): Promise<CommunityMemberPage | null> => {
    const member = await createPublicUsersRepositoryServer().getByUsername(username);
    if (!member || !member.verified || member.is_hidden) return null;

    const [feed, featured] = await Promise.all([
      pub().getPublishedFeed(null, '', COMMUNITY_MEMBER_POSTS_PAGE_SIZE, undefined, member.id),
      pub().getFeaturedPublishedByAuthor(member.id),
    ]);
    const author = {
      username: member.username,
      name: member.name,
      avatar_url: member.avatar_url,
    };

    const page = feed.posts.map((post) => ({ ...post, author }));
    const posts =
      featured && !page.some((post) => post.id === featured.id)
        ? [{ ...featured, author }, ...page]
        : page;

    return {
      member,
      // A pin sorts first on the author's page; the community feed keeps its
      // chronological order (the pin is the profile's, not everyone's).
      posts: [...posts].sort((a, b) => Number(b.featured) - Number(a.featured)),
      nextCursor: feed.nextCursor,
    };
  },
  ['community-member'],
  { revalidate: COMMUNITY_CACHE_SECONDS, tags: [COMMUNITY_TAGS.memberByUsername] }
);
