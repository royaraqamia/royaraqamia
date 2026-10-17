import type { Metadata } from 'next';

import { FAQAccordion } from '@/frontend/ui/FAQAccordion';
import { faqSchema, faqs } from '@/frontend/ui/faq-data';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'الأسئلة الشَّائعة',
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
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>الأسئلة الشَّائعة</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <FAQAccordion faqs={faqs} />
    </div>
  );
}
