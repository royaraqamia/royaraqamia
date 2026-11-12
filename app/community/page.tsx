import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { loadCommunityMembers } from '@/backend/loaders/community';
import { loadFollowingFeed, resolveFollowingSession } from '@/backend/loaders/following-feed';
import { createFollowsService } from '@/backend/config/follows';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { CommunityIndexResults } from './_components/community-index-results';
import { CommunitySearch } from './_components/community-search';
import { CommunityMembersPanel, CommunityMembersStrip } from './_components/community-members';
import { ComposeFab } from './_components/compose-fab';
import { COMMUNITY_PAGE_SIZE } from './_components/constants';

/**
 * The member's own feed: their posts and the posts of the members they follow,
 * and nothing else until they follow someone.
 *
 * Rendered per request, never cached. The page is one member's answer to "what
 * did the people I follow publish", so a shared ISR document would be wrong for
 * everyone but one visitor - and the read runs as the caller (`loadFollowingFeed`
 * resolves the session and reads through RLS), so there is no viewer id to
 * forge either.
 *
 * `noindex`: the crawler's version of this page is the empty state, and the hub
 * it should rank instead is `/community/explore`, which stays one cacheable
 * document for every visitor.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'المجتمع',
  description: 'أفكار، دروس، وقصص في العالم الرَّقمي',
  robots: { index: false, follow: true },
};

export default async function CommunityPage() {
  // The session is resolved once: the feed, the roster's states and the
  // following count all need this member, and each resolution is an auth round
  // trip - three of them would be the heaviest thing on the page.
  const session = await resolveFollowingSession();

  const [{ posts, nextCursor, signedIn }, members] = await Promise.all([
    loadFollowingFeed(session, null, '', COMMUNITY_PAGE_SIZE),
    loadCommunityMembers(),
  ]);

  // One service, two reads in parallel: the roster's states (so every row's
  // control is correct in the first paint) and the following count (so "nobody
  // followed yet" is a different sentence from "nothing new").
  const service = session ? createFollowsService() : null;
  const [rosterStates, followingCount] =
    session && service
      ? await Promise.all([
          service.statesFor(
            session.userId,
            members.map((member) => member.id)
          ),
          service.countsOf(session.userId).then((counts) => counts.following),
        ])
      : [undefined, 0];

  // Three empty feeds, three sentences: a guest has no follows yet by
  // definition, a member with none has to be shown where to find people, and a
  // member who follows people whose posts are not published yet is "nothing new"
  // rather than "nobody".
  const emptyKind = !signedIn ? 'guest' : followingCount === 0 ? 'no-follows' : 'none';

  return (
    <div className="min-h-screen text-foreground selection:bg-primary/30 selection:text-white pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-4 relative z-10">
        <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
          <SectionTitle as="h1">
            <SectionTitleHighlight>المجتمع</SectionTitleHighlight>
          </SectionTitle>
          <Link
            href="/community/explore"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-3.5 py-1.5 text-xs font-bold text-muted-foreground transition-safe duration-200 hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            كل المنشورات
            <ArrowLeft className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        {/* Both steps of the two-column pair are variants, never a base utility
            plus a variant: whichever surface's stylesheet was appended last wins
            a contest on a base class, and one that compiles `grid-cols-1` folds
            the rail under the feed after a client-side navigation (ADR-0132). */}
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

            <CommunityMembersStrip members={members} states={rosterStates} />

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
              <CommunityIndexResults
                initialPosts={posts}
                initialNextCursor={nextCursor}
                source="following"
                emptyKind={emptyKind}
              />
            </Suspense>
          </div>

          {/* Members rail (desktop). `max-lg:hidden`, never `hidden lg:block`: a
              variant class can only be outranked by another variant, so the pair
              is immune to whichever stylesheet wins, the shell's or this surface's
              (ADR-0132). An `aside` is already `display: block` at
              `lg`, so there is nothing to restore. */}
          <aside className="sticky top-24 max-lg:hidden self-start" aria-label="أعضاء المجتمع">
            <CommunityMembersPanel members={members} states={rosterStates} />
          </aside>
        </div>
      </div>

      <ComposeFab />
    </div>
  );
}
