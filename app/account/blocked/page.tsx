import type { Metadata } from 'next';

import { BlockedMembersView } from '@/frontend/ui/account/blocked-members-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'الأعضاء المحظورون',
  description: 'الأعضاء الذين حظرتهم على مجتمع رؤيَة رَقَميَّة، وإلغاء الحظر عنهم.',
};

/**
 * A data-free shell, like the rest of `/account` (#448): the guard and the read
 * live in `BlockedMembersView` on the client.
 *
 * Rendered per request on purpose, though the document is the same for
 * everyone: the precache list is a measured budget (ADR-0071) with a hard cap,
 * and a slot spent on a page that shows nothing offline pushes `/verify` — the
 * link printed on physical certificates — out of the tail. The worker still
 * caches this document at runtime (stale-while-revalidate), so a second open
 * paints immediately; the first one is the only fetch. `/account/services` makes
 * the same trade (see `DYNAMIC_BY_DESIGN`).
 */
export const dynamic = 'force-dynamic';

export default function AccountBlockedPage() {
  return (
    <div className="space-y-6">
      <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
        <SectionTitle as="h1">
          <SectionTitleHighlight>الأعضاء المحظورون</SectionTitleHighlight>
        </SectionTitle>
      </div>

      <BlockedMembersView />
    </div>
  );
}
