import type { Metadata } from 'next';
import { Suspense } from 'react';
import { loadCommunityIndex, loadCommunityMembers } from '@/backend/loaders/community';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { CommunityIndexResults } from '../_components/community-index-results';
import { CommunitySearch } from '../_components/community-search';
import { CommunityMembersPanel, CommunityMembersStrip } from '../_components/community-members';
import { ComposeFab } from '../_components/compose-fab';
import { COMMUNITY_PAGE_SIZE } from '../_components/constants';

/**
 * The public hub: every published community post, one cacheable document for
 * every visitor.
 *
 * `/community` became the member's own feed when follows landed, so the page a
 * crawler should rank - the one that links every post and carries the roster -
 * needs a URL of its own. This is it: the same read the index page always did
 * (`loadCommunityIndex`), cached for 300 seconds and shared, which is exactly
 * what a personalized feed cannot be.
 *
 * `canonical` points here, and `sitemap.ts` lists this path in place of
 * `/community`: ranking moves in one hop without breaking a bookmarked link, and
 * the personal page never enters the index.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'كل المنشورات',
  description: 'كل ما نُشر في مجتمع رؤيَة رقَميَّة: أفكار، دروس، وقصص في العالم الرَّقمي',
  alternates: { canonical: '/community/explore' },
};

export default async function CommunityExplorePage() {
  const [{ posts, nextCursor }, members] = await Promise.all([
    loadCommunityIndex(null, '', COMMUNITY_PAGE_SIZE),
    loadCommunityMembers(),
  ]);

  return (
    <div className="min-h-screen text-foreground selection:bg-primary/30 selection:text-white pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-4 relative z-10">
        <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
          <SectionTitle as="h1">
            <SectionTitleHighlight>كل المنشورات</SectionTitleHighlight>
          </SectionTitle>
        </div>

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

            <CommunityMembersStrip members={members} />

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
          </div>

          <aside className="sticky top-24 max-lg:hidden self-start" aria-label="أعضاء المجتمع">
            <CommunityMembersPanel members={members} />
          </aside>
        </div>
      </div>

      <ComposeFab />
    </div>
  );
}
