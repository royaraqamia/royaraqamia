import type { Metadata } from 'next';

import { ACCOUNT_NEWS_PREFERENCES_COPY } from '@/frontend/ui/account/account-news-preferences-copy';
import { NewsPreferences } from '@/frontend/ui/account/news-preferences';
import { NewsPrivateSources } from '@/frontend/ui/account/news-private-sources';

export const metadata: Metadata = {
  title: ACCOUNT_NEWS_PREFERENCES_COPY.pageTitle,
  description: 'اختر المصادر التي تريد أن تقرأها في المُلخَّص اليومي.',
};

/**
 * A data-free shell, like the other `/account` children: the guard and the read
 * live in the client components, so the document carries nothing
 * account-bearing and the worker may cache it (ADR-0031's #448 amendment).
 *
 * Two islands: the catalogue checklist, and one section for the reader's own
 * sources — the field they add a link with and the list that link lands in
 * (ADR-0130). The page's heading lives in `NewsPreferences` so the app's screen
 * draws the same sentence from the same generated copy (ADR-0098).
 */
export default function AccountNewsPage() {
  return (
    <div className="space-y-6">
      <NewsPreferences />

      <div className="border-t border-border/50 pt-6">
        <NewsPrivateSources />
      </div>
    </div>
  );
}
