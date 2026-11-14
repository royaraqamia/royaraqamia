import { z } from 'zod';
import type { PublicUser } from '@/shared/contracts/users';

/**
 * The two numbers a profile header draws.
 *
 * They are public while the lists behind them are not: a visitor may read "12
 * متابِع" without being shown who those twelve are, and only the member
 * themselves may open the list. That is why the counts come from an aggregate
 * (`follow_counts`) rather than from a readable edge table.
 */
export interface FollowCounts {
  followers: number;
  following: number;
}

export const FollowCountsSchema = z.object({
  followers: z.coerce.number().int().nonnegative(),
  following: z.coerce.number().int().nonnegative(),
});

/**
 * Where the viewer stands on a member, in one word.
 *
 * `self` is the viewer's own profile - there is no button, because there is
 * nothing to press. `blocked` covers either direction: a block hides the
 * button and leaves `/account/blocked` as the only way back, which is why the
 * response says which state it is in rather than only that it failed.
 */
export type FollowState = 'self' | 'following' | 'not_following' | 'blocked';

export const FollowStateSchema = z.enum(['self', 'following', 'not_following', 'blocked']);

/**
 * What `POST`/`DELETE /api/users/[username]/follow` answers, and what both
 * clients decode instead of guessing from the status. `counts` is the member's
 * numbers after the write, so the header updates without a second read.
 */
export const FollowToggleResponseSchema = z.object({
  success: z.boolean(),
  state: FollowStateSchema,
  counts: FollowCountsSchema.optional(),
  error: z.string().optional(),
});

export type FollowToggleResponse = z.infer<typeof FollowToggleResponseSchema>;

/**
 * One member on a follower or following list, with the viewer's own relation
 * to them so a row can draw the right control without a read per row. These
 * lists are only ever returned to their owner, so `following` is the owner's
 * own edge.
 */
export interface FollowListEntry extends PublicUser {
  following: boolean;
}

export const FollowListEntrySchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  verified: z.boolean(),
  following: z.boolean(),
});

/** A private list page: its rows, and how many rows there are in total. */
export interface FollowListPage {
  members: FollowListEntry[];
  total: number;
}

export const FollowListPageSchema = z.object({
  members: z.array(FollowListEntrySchema),
  total: z.coerce.number().int().nonnegative(),
});

export const FollowListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

/**
 * How many follows one member may write in a minute.
 *
 * Not a product cap: this directory is small, and a total ceiling would either
 * never bind or bind on a member who is simply enthusiastic. What it stops is a
 * script walking the roster, which is the abuse this surface can actually meet.
 * Revisit it with a daily ceiling when the directory passes about a thousand
 * members, where "follow everyone" stops being a human act.
 */
export const FOLLOW_WRITE_LIMIT = 30;
export const FOLLOW_WRITE_WINDOW_MS = 60_000;

/** Rows per page on a follower or following list. */
export const FOLLOW_LIST_PAGE_SIZE = 30;
