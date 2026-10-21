import type { Metadata } from 'next';

import { MyLinksView } from '@/frontend/ui/account/my-links-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'الرَّوابط المختصَرة',
  description: 'روابطك المختصَرة في LinkSnap مع تحليلات الزِّيارات لكلِّ رابط.',
};

/**
 * A data-free shell: the guard lives in `MyLinksView` on the client (#448), so
 * the document carries nothing account-bearing and the worker may cache it.
 * The owned list paints from the Local Store; the analytics stay server-only
 * and degrade to the view's own needs-connection state.
 */
export default function AccountLinksPage() {
  return (
    <div className="space-y-6">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>الرَّوابط المختصَرة</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <MyLinksView />
    </div>
  );
}
