import 'server-only';

import {
  createBlogpressAdminPostsModule,
  createBlogpressPostsModule,
} from '@/backend/config/blogpress';
import { createFollowsService } from '@/backend/config/follows';
import { identity } from '@/backend/config/identity';
import type { PostSummary } from '@/shared/contracts/blogpress';

/**
 * The signed-in member's feed: their own posts and the posts of the members
 * they follow, and nothing else.
 *
 * Deliberately not cached, and deliberately not a function of its arguments:
 * the answer depends on who is asking. `loadCommunityIndex` is one document for
 * every visitor, which is exactly what this one cannot be.
 *
 * It resolves the request's identity (cookie **or** bearer, so the app reads the
 * same rows the page does) and runs the read as that member, so `following_feed`'s
 * RLS is the authority rather than a viewer id passed in from outside.
 *
 * A guest gets an empty page rather than an error: "no follows yet" and "not
 * signed in" are different sentences on the surface, but both mean no rows.
 */
export async function loadFollowingFeed(
  cursor: string | null,
  query: string,
  pageSize: number
): Promise<{
  posts: PostSummary[];
  nextCursor: string | null;
  signedIn: boolean;
  /** How many members the viewer follows — the difference between "nobody" and "nothing new". */
  followingCount: number;
}> {
  const { user, client } = await identity.resolveSession();
  if (!user) return { posts: [], nextCursor: null, signedIn: false, followingCount: 0 };

  const [feed, counts] = await Promise.all([
    createBlogpressPostsModule(client).repository.getFollowingFeed(cursor, query, pageSize),
    createFollowsService().countsOf(user.id),
  ]);

  const authorIds = [...new Set(feed.posts.map((post) => post.author_id))];
  const authors = await createBlogpressAdminPostsModule().repository.getPostAuthors(authorIds);

  return {
    posts: feed.posts.map((post) => ({
      ...post,
      author: authors[post.author_id] ?? null,
    })),
    nextCursor: feed.nextCursor,
    signedIn: true,
    followingCount: counts.following,
  };
}
