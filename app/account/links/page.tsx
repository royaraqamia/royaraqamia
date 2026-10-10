import type { Metadata } from 'next';

import { requireAuth } from '@/backend/middleware/auth-guard';
import { MyLinksView } from '@/frontend/ui/account/my-links-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'الرَّوابط المختصَرة',
  description: 'روابطك المختصَرة في LinkSnap مع تحليلات الزِّيارات لكلِّ رابط.',
};

export default async function AccountLinksPage() {
  await requireAuth('/auth/login?redirect=/account/links');

  return (
    <div className="space-y-6">
      <div className="text-center flex flex-col items-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>الرَّوابط المختصَرة</SectionTitleHighlight>
        </SectionTitle>
      </div>

      <MyLinksView />
    </div>
  );
}
