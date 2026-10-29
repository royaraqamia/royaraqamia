import type { Metadata } from 'next';

import { PlanView } from '@/frontend/ui/account/plan-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'الاشتراك والاستهلاك',
  description: 'خطتك الحالية في رؤيَة رَقَميَّة، واستهلاكك لكل عنصر، وسجل الاشتراك.',
};

/**
 * A data-free shell, like the other `/account` children: the guard and the read
 * live in `PlanView` on the client, so the document carries nothing
 * account-bearing and the worker may cache it (ADR-0031's #448 amendment).
 */
export default function AccountPlanPage() {
  return (
    <div className="space-y-6">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>الاشتراك والاستهلاك</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <PlanView />
    </div>
  );
}
