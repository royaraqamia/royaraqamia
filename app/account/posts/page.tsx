import type { Metadata } from 'next';

import { AccountPostsView } from '@/frontend/ui/account/account-posts-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'المنشورات',
  description: 'منشوراتك على مجتمع رؤيَة رَقَميَّة.',
};

/**
 * A data-free shell: the guard and the read live in `AccountPostsView` on the
 * client. The read is the Local Store, seeded by the never-cache
 * `/api/community/sync` pull, so the document carries nothing account-bearing
 * and the worker may cache it. A draft written offline is on disk and paints
 * before any network answer.
 */
export default function AccountPostsPage() {
  return (
    <div className="space-y-6">
      <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
        <SectionTitle as="h1">
          <SectionTitleHighlight>المنشورات</SectionTitleHighlight>
        </SectionTitle>
      </div>

      <AccountPostsView />
    </div>
  );
}
