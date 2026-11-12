import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { FollowCounts } from '@/shared/contracts/follows';
import { guardRepositoryMethods, isNotFoundError } from '@/backend/shared/repository-error';

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
  /** Insert the edge; an existing one is not an error. */
  follow(followerId: string, followeeId: string): Promise<void>;
  /** Remove the edge; a missing one is not an error. */
  unfollow(followerId: string, followeeId: string): Promise<void>;
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
}

export function createFollowsRepository(supabase: SupabaseClient<Database>): FollowsRepository {
  return guardRepositoryMethods<FollowsRepository>({
    async follow(followerId, followeeId) {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: followerId, followee_id: followeeId });

      // Following twice is the same edge from the member's point of view.
      if (error && error.code !== UNIQUE_VIOLATION) throw error;
    },

    async unfollow(followerId, followeeId) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('followee_id', followeeId);

      if (error) throw error;
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
      const from = (page - 1) * pageSize;

      const { data, error, count } = await supabase
        .from('follows')
        .select('follower_id', { count: 'exact' })
        .eq('followee_id', userId)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      return { ids: (data ?? []).map((row) => row.follower_id), total: count ?? 0 };
    },

    async listFollowingIds(userId, page, pageSize) {
      const from = (page - 1) * pageSize;

      const { data, error, count } = await supabase
        .from('follows')
        .select('followee_id', { count: 'exact' })
        .eq('follower_id', userId)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      return { ids: (data ?? []).map((row) => row.followee_id), total: count ?? 0 };
    },

    async isBlockedEitherWay(a, b): Promise<boolean> {
      // Two reads rather than one `or()`: each half is a primary-key lookup, and
      // neither needs a filter string built from two ids.
      const [blockedByViewer, blockedViewer] = await Promise.all([
        supabase
          .from('blocks')
          .select('blocker_id', { count: 'exact', head: true })
          .eq('blocker_id', a)
          .eq('blocked_id', b),
        supabase
          .from('blocks')
          .select('blocker_id', { count: 'exact', head: true })
          .eq('blocker_id', b)
          .eq('blocked_id', a),
      ]);

      if (blockedByViewer.error && !isNotFoundError(blockedByViewer.error))
        throw blockedByViewer.error;
      if (blockedViewer.error && !isNotFoundError(blockedViewer.error)) throw blockedViewer.error;

      return (blockedByViewer.count ?? 0) > 0 || (blockedViewer.count ?? 0) > 0;
    },
  });
}

/** Postgres' duplicate-key code, the one answer a re-follow is allowed to give. */
const UNIQUE_VIOLATION = '23505';
