import type { Metadata } from 'next';

import { MyPostsView } from '@/frontend/ui/account/my-posts-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'المنشورات',
  description: 'منشوراتك على مجتمع رؤيَة رَقَميَّة.',
};

/**
 * A data-free shell: the guard and the read live in `MyPostsView` on the client
 * (#448), so the document carries nothing account-bearing and the worker may
 * cache it. The read runs on the never-cache `/api/me` prefix, so offline the
 * view answers with its own needs-connection state instead of the stale list a
 * cached response would replay.
 */
export default function AccountPostsPage() {
  return (
    <div className="space-y-6">
      <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
        <SectionTitle as="h1">
          <SectionTitleHighlight>المنشورات</SectionTitleHighlight>
        </SectionTitle>
      </div>

      <MyPostsView />
    </div>
  );
}
