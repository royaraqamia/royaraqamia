import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import {
  createBlogpressAdminPostsModule,
  createBlogpressPostsModule,
} from '@/backend/config/blogpress';
import { identity } from '@/backend/config/identity';
import type { PostSummary } from '@/shared/contracts/blogpress';

/**
 * The request's identity, resolved once.
 *
 * `identity.resolveSession()` is not free: a cookie session costs a Supabase
 * auth round trip. A page that needs both the feed and the roster's follow states
 * must not pay for it twice, so the session is resolved here and handed to the
 * loaders as an argument.
 */
export interface FollowingSession {
  userId: string;
  client: SupabaseClient<Database>;
}

export async function resolveFollowingSession(): Promise<FollowingSession | null> {
  const { user, client } = await identity.resolveSession();
  return user ? { userId: user.id, client } : null;
}

/**
 * The signed-in member's feed: their own posts and the posts of the members
 * they follow, and nothing else.
 *
 * Deliberately not cached, and deliberately not a function of its arguments
 * alone: the answer depends on who is asking. `loadCommunityIndex` is one
 * document for every visitor, which is exactly what this one cannot be.
 *
 * It reads as the member (`following_feed` is `security_invoker`), so RLS is the
 * authority rather than a viewer id passed in from outside.
 *
 * A guest gets an empty page rather than an error: "no follows yet" and "not
 * signed in" are different sentences on the surface, but both mean no rows.
 */
export async function loadFollowingFeed(
  session: FollowingSession | null,
  cursor: string | null,
  query: string,
  pageSize: number
): Promise<{
  posts: PostSummary[];
  nextCursor: string | null;
  signedIn: boolean;
}> {
  if (!session) return { posts: [], nextCursor: null, signedIn: false };

  const feed = await createBlogpressPostsModule(session.client).repository.getFollowingFeed(
    cursor,
    query,
    pageSize
  );

  const authorIds = [...new Set(feed.posts.map((post) => post.author_id))];
  const authors = await createBlogpressAdminPostsModule().repository.getPostAuthors(authorIds);

  return {
    posts: feed.posts.map((post) => ({
      ...post,
      author: authors[post.author_id] ?? null,
    })),
    nextCursor: feed.nextCursor,
    signedIn: true,
  };
}
