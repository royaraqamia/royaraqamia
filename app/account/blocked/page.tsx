import type { Metadata } from 'next';

import { BLOCKED_MEMBERS_COPY } from '@/frontend/ui/account/blocked-members-copy';
import { BlockedMembersView } from '@/frontend/ui/account/blocked-members-view';

export const metadata: Metadata = {
  title: BLOCKED_MEMBERS_COPY.pageTitle,
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
  return <BlockedMembersView />;
}
