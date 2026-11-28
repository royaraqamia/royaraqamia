import { Suspense } from 'react';

import type { PostSummary } from '@/shared/contracts/blogpress';
import type { PublicUser } from '@/shared/contracts/users';
import { CommunityIndexResults } from '../../_components/community-index-results';
import { CommunitySearch } from '../../_components/community-search';
import {
  ResponsiveCommunityMembersPanel,
  ResponsiveCommunityMembersStrip,
} from '../../_components/community-members-responsive';

export interface CommunityExploreBodyProps {
  posts: PostSummary[];
  nextCursor: string | null;
  /** Already filtered to supply by `loadCommunityMembers` (#1952). */
  members: PublicUser[];
}

/**
 * The public hub's body, feed first (#1952).
 *
 * The audit's hub opened with nineteen follow buttons over four posts; the rail
 * drew attention to accounts instead of to what there was to read. Supply now
 * comes first: the search, the feed, and only then the roster — filtered to
 * authors while the product has fewer than three, and omitted when there are
 * none. The desktop rail still sits beside the feed, but it is no longer the
 * first interactive block a phone meets.
 *
 * Kept apart from the page so the ordering is asserted without a server read;
 * the page owns the two loads and the route's cache.
 */
export function CommunityExploreBody({ posts, nextCursor, members }: CommunityExploreBodyProps) {
  return (
    <div className="grid items-start max-lg:grid-cols-1 max-lg:gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
      <div className="min-w-0">
        <Suspense
          fallback={
            <div
              className="mx-auto mb-8 h-11 w-full max-w-xl rounded-xl bg-muted/20 animate-pulse sm:mb-10"
              aria-hidden="true"
            />
          }
        >
          <div className="mx-auto mb-8 w-full max-w-xl sm:mb-10">
            <CommunitySearch />
          </div>
        </Suspense>

        <Suspense
          fallback={
            <div className="mx-auto flex w-full max-w-xl flex-col gap-6" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-3xl border border-border bg-muted/20 overflow-hidden animate-pulse"
                >
                  <div className="aspect-16/10 w-full bg-muted/60" />
                  <div className="p-6 sm:p-7 space-y-3">
                    <div className="h-5 w-3/4 rounded-full bg-muted/70" />
                    <div className="h-3.5 w-full rounded-full bg-muted/50" />
                    <div className="h-3.5 w-2/3 rounded-full bg-muted/50" />
                  </div>
                </div>
              ))}
            </div>
          }
        >
          <CommunityIndexResults initialPosts={posts} initialNextCursor={nextCursor} />
        </Suspense>

        <ResponsiveCommunityMembersStrip members={members} signInReturnTo="/community/explore" />
      </div>

      <ResponsiveCommunityMembersPanel members={members} signInReturnTo="/community/explore" />
    </div>
  );
}
