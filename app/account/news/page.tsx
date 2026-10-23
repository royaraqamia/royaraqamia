import type { Metadata } from 'next';

import { NewsPreferences } from '@/frontend/ui/account/news-preferences';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'مصادر الأخبار',
  description: 'اختر المصادر التي تريد أن تقرأها في المُلخَّص اليومي.',
};

/**
 * A data-free shell, like the other `/account` children: the guard and the read
 * live in `NewsPreferences` on the client, so the document carries nothing
 * account-bearing and the worker may cache it (ADR-0031's #448 amendment).
 */
export default function AccountNewsPage() {
  return (
    <div className="space-y-6">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>مصادر الأخبار</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <NewsPreferences />
    </div>
  );
}
