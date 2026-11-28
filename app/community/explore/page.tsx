import type { Metadata } from 'next';
import { loadCommunityIndex, loadCommunityMembers } from '@/backend/loaders/community';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { ComposeFab } from '../_components/compose-fab';
import { COMMUNITY_PAGE_SIZE } from '../_components/constants';
import { CommunityExploreBody } from './_components/community-explore-body';

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
 *
 * The body draws the feed before the roster (#1952): the roster is a consequence
 * of supply, not the page's opening offer.
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

        <CommunityExploreBody posts={posts} nextCursor={nextCursor} members={members} />
      </div>

      <ComposeFab />
    </div>
  );
}
