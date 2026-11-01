import type { Metadata } from 'next';

import { PlanView } from '@/frontend/ui/account/plan-view';

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
  return <PlanView />;
}
