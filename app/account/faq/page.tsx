import type { Metadata } from 'next';

import { ACCOUNT_FAQ_COPY } from '@/frontend/ui/account/faq-copy';
import { faqSchema } from '@/frontend/ui/account/faq-schema';
import { AccountFaqView } from '@/frontend/ui/account/faq-view';

export const metadata: Metadata = {
  title: ACCOUNT_FAQ_COPY.pageTitle,
  description:
    'أجوبة عن طرق الدَّفع والعملات المقبولة والدَّفع بالتَّقسيط وشروط التَّدريب في رؤيَة رَقَميَّة.',
};

/**
 * The FAQ used to be the last section of the home page. It moved here, behind a
 * row on `/account`, so the home page ends on the sections that sell the work
 * while the answers stay one tap away.
 *
 * Open to guests on purpose — the content is public. `/account` as a whole is
 * disallowed in `robots.ts`, so this one path is re-allowed there and listed in
 * `sitemap.ts`, which is what keeps the `FAQPage` schema below crawlable.
 */
export default function AccountFaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <AccountFaqView />
    </>
  );
}
