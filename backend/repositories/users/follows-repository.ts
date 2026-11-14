import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { FollowCounts } from '@/shared/contracts/follows';
import {
  guardRepositoryMethods,
  isNotFoundError,
  isRangeNotSatisfiableError,
} from '@/backend/shared/repository-error';

/** What one call to `follow_edge` decided. */
export type FollowEdgeOutcome = 'ok' | 'self' | 'blocked' | 'not_found';

/** The three outcomes that name a member the caller may be shown. */
export type FollowEdgeDecision = Exclude<FollowEdgeOutcome, 'not_found'>;

/**
 * The answer to a follow or unfollow, in one round trip.
 *
 * `viewer` is present only when this call wrote a new edge: the notification is
 * the one thing on this path that needs the follower's name, so the row is read
 * only when there is somebody to tell.
 */
export type FollowEdgeResult =
  | { outcome: 'not_found' }
  | {
      outcome: FollowEdgeDecision;
      targetId: string;
      wrote: boolean;
      counts: FollowCounts;
      viewer: { name: string | null; username: string | null } | null;
    };

/**
 * The follow graph, as rows.
 *
 * Writes are idempotent by construction: the pair is the primary key, so a
 * retried follow is the same row rather than an error, and an unfollow of an
 * edge nobody wrote is a no-op. That is what lets the service retry without
 * reading first.
 *
 * `counts` reads an aggregate function rather than counting rows here, because
 * the rows are not readable by the caller who needs the number: a visitor sees
 * the counts on a profile and never the edges behind them.
 */
export interface FollowsRepository {
  /**
   * Resolve, judge and write one edge, and answer the target's counts.
   *
   * One call, because the rules the service states are a sequence of reads
   * whose answers only the database needs: six of them in a row was the 1.7 s a
   * press took (#1374). `username` is the handle as it was typed; the function
   * lowercases it the way every other read of `users.username` does.
   */
  followEdge(followerId: string, username: string, follow: boolean): Promise<FollowEdgeResult>;
  isFollowing(followerId: string, followeeId: string): Promise<boolean>;
  /** Both numbers per member, in one read. A member with no rows answers zeros. */
  counts(userIds: string[]): Promise<Record<string, FollowCounts>>;
  /**
   * The ids of the members who follow `userId`, newest first, and the total.
   * Ids rather than rows: the service hydrates them through the public
   * directory, which is the one projection allowed to shape a member.
   */
  listFollowerIds(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ ids: string[]; total: number }>;
  /** The ids `userId` follows, newest first, and the total. */
  listFollowingIds(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ ids: string[]; total: number }>;
  /** True when either member has blocked the other. */
  isBlockedEitherWay(a: string, b: string): Promise<boolean>;
  /**
   * Which of `ids` the follower already follows, in one read.
   *
   * A list of fifty members is one query, not fifty: the roster draws a control
   * per row and a state read per row is what makes a rail cost more than the
   * feed it sits beside.
   */
  followingAmong(followerId: string, ids: string[]): Promise<string[]>;
  /** The blocks between the viewer and `ids`, in both directions, in one read. */
  blockedAmong(
    viewerId: string,
    ids: string[]
  ): Promise<{ blockedByViewer: string[]; blockedViewer: string[] }>;
}

export function createFollowsRepository(supabase: SupabaseClient<Database>): FollowsRepository {
  // A closure rather than a method: `guardRepositoryMethods` calls each entry as
  // a bare function, so `this` inside a repository method is not the object.
  async function blockedAmong(
    viewerId: string,
    ids: string[]
  ): Promise<{ blockedByViewer: string[]; blockedViewer: string[] }> {
    const unique = [...new Set(ids)].filter((id) => id !== viewerId);
    if (unique.length === 0) return { blockedByViewer: [], blockedViewer: [] };

    // One read of the viewer's own block rows, split into the two directions.
    // Both halves are visible to the service role; a policy would only ever
    // show the caller the rows they wrote, which is why the judgement lives
    // here and not in RLS.
    const { data, error } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`);

    if (error) throw error;

    const requested = new Set(unique);
    const blockedByViewer: string[] = [];
    const blockedViewer: string[] = [];

    for (const row of data ?? []) {
      if (row.blocker_id === viewerId && requested.has(row.blocked_id)) {
        blockedByViewer.push(row.blocked_id);
      } else if (row.blocked_id === viewerId && requested.has(row.blocker_id)) {
        blockedViewer.push(row.blocker_id);
      }
    }

    return { blockedByViewer, blockedViewer };
  }

  /**
   * One page of the graph, and the total behind it.
   *
   * A page past the last row is a real request with an empty answer, not a
   * failure: PostgREST refuses a range beyond the rows with 416, and that
   * response carries no count, so the total is read on its own - one extra
   * query, only on the path that used to answer 500.
   */
  async function pageOfIds(
    matchColumn: 'follower_id' | 'followee_id',
    idColumn: 'follower_id' | 'followee_id',
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ ids: string[]; total: number }> {
    const from = (page - 1) * pageSize;

    const { data, error, count } = await supabase
      .from('follows')
      .select('follower_id, followee_id', { count: 'exact' })
      .eq(matchColumn, userId)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (!error) {
      return { ids: (data ?? []).map((row) => row[idColumn]), total: count ?? 0 };
    }

    if (!isRangeNotSatisfiableError(error)) throw error;

    const counted = await supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq(matchColumn, userId);

    if (counted.error) throw counted.error;
    return { ids: [], total: counted.count ?? 0 };
  }

  return guardRepositoryMethods<FollowsRepository>({
    async followEdge(followerId, username, follow) {
      const { data, error } = await supabase.rpc('follow_edge', {
        p_follower_id: followerId,
        p_username: username.toLowerCase(),
        p_follow: follow,
      });

      if (error) throw error;

      const row = data?.[0];
      if (!row) throw new Error('follow_edge answered no row');

      if (row.outcome === 'not_found' || !row.target_id) {
        return { outcome: 'not_found' };
      }

      return {
        outcome: row.outcome as FollowEdgeDecision,
        targetId: row.target_id,
        wrote: row.wrote,
        counts: {
          followers: Number(row.target_followers),
          following: Number(row.target_following),
        },
        // Only the call that wrote the edge names the follower; the function
        // answers nulls for every other outcome.
        viewer:
          row.viewer_name === null && row.viewer_username === null
            ? null
            : { name: row.viewer_name, username: row.viewer_username },
      };
    },

    async isFollowing(followerId, followeeId): Promise<boolean> {
      const { data, error } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', followerId)
        .eq('followee_id', followeeId)
        .maybeSingle();

      if (error && !isNotFoundError(error)) throw error;
      return data !== null;
    },

    async counts(userIds): Promise<Record<string, FollowCounts>> {
      const unique = [...new Set(userIds)];
      if (unique.length === 0) return {};

      const { data, error } = await supabase.rpc('follow_counts', { p_user_ids: unique });
      if (error) throw error;

      const counts: Record<string, FollowCounts> = {};
      for (const id of unique) counts[id] = { followers: 0, following: 0 };
      for (const row of data ?? []) {
        counts[row.user_id] = {
          followers: Number(row.followers),
          following: Number(row.following),
        };
      }
      return counts;
    },

    async listFollowerIds(userId, page, pageSize) {
      return pageOfIds('followee_id', 'follower_id', userId, page, pageSize);
    },

    async listFollowingIds(userId, page, pageSize) {
      return pageOfIds('follower_id', 'followee_id', userId, page, pageSize);
    },

    async isBlockedEitherWay(a, b): Promise<boolean> {
      const { blockedByViewer, blockedViewer } = await blockedAmong(a, [b]);
      return blockedByViewer.includes(b) || blockedViewer.includes(b);
    },

    async followingAmong(followerId, ids): Promise<string[]> {
      const unique = [...new Set(ids)].filter((id) => id !== followerId);
      if (unique.length === 0) return [];

      const { data, error } = await supabase
        .from('follows')
        .select('followee_id')
        .eq('follower_id', followerId)
        .in('followee_id', unique);

      if (error) throw error;
      return (data ?? []).map((row) => row.followee_id);
    },

    blockedAmong,
  });
}
