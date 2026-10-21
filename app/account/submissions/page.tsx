import type { Metadata } from 'next';

import { MySubmissionsView } from '@/frontend/ui/account/my-submissions-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'طلباتي',
  description: 'طلباتك المرسلة من نماذج رؤيَة رَقَميَّة، مع إمكانيَّة تعديلها.',
};

/**
 * A data-free shell: the guard and the reads live in `MySubmissionsView` on the
 * client (#448), so the document carries nothing account-bearing and the worker
 * may cache it. Its reads run on the never-cache `/api` prefixes, so offline it
 * answers with its own needs-connection state, never stale rows.
 */
export default function AccountSubmissionsPage() {
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
