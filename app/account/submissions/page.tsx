import type { Metadata } from 'next';

import { requireAuth } from '@/backend/middleware/auth-guard';
import { MySubmissionsView } from '@/frontend/ui/account/my-submissions-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'طلباتي',
  description: 'طلباتك المرسلة من نماذج رؤيَة رَقَميَّة، مع إمكانيَّة تعديلها.',
};

export default async function AccountSubmissionsPage() {
  await requireAuth('/auth/login?redirect=/account/submissions');

  return (
    <div className="space-y-6">
      <div className="text-center flex flex-col items-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>طلباتي</SectionTitleHighlight>
        </SectionTitle>
      </div>

      <MySubmissionsView />
    </div>
  );
}
