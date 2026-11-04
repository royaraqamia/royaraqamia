import { FAQAccordion, type FAQItem } from '@/frontend/ui/FAQAccordion';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

import { ACCOUNT_FAQ_COPY } from './faq-copy';

/**
 * The FAQ's content, in the order the page draws it and the JSON-LD publishes it.
 *
 * The words come from `shared/copy/account-faq.json` through the generated
 * [ACCOUNT_FAQ_COPY], so the app's screen reads the same strings instead of
 * retyping a question (ADR-0098). `faqSchema` builds the structured data from this
 * same list, which is what keeps an edited answer from leaving the JSON-LD stale.
 */
export const faqs: FAQItem[] = [
  { question: ACCOUNT_FAQ_COPY.question1, answer: ACCOUNT_FAQ_COPY.answer1 },
  { question: ACCOUNT_FAQ_COPY.question2, answer: ACCOUNT_FAQ_COPY.answer2 },
  { question: ACCOUNT_FAQ_COPY.question3, answer: ACCOUNT_FAQ_COPY.answer3 },
  { question: ACCOUNT_FAQ_COPY.question4, answer: ACCOUNT_FAQ_COPY.answer4 },
  { question: ACCOUNT_FAQ_COPY.question5, answer: ACCOUNT_FAQ_COPY.answer5 },
  { question: ACCOUNT_FAQ_COPY.question6, answer: ACCOUNT_FAQ_COPY.answer6 },
  { question: ACCOUNT_FAQ_COPY.question7, answer: ACCOUNT_FAQ_COPY.answer7 },
];

/**
 * The page the visitor sees: the title and the accordion over [faqs].
 *
 * The `data-visual` hooks are the visual gate's own names for the boxes it
 * measures (`shared/visual/account-faq.json`); they sit on the elements the
 * accordion already draws rather than on a copy composed for the test.
 */
export function AccountFaqView() {
  return (
    <div className="space-y-6">
      <header data-visual="faq-title" className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{ACCOUNT_FAQ_COPY.pageTitle}</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <FAQAccordion faqs={faqs} visualPrefix="faq" />
    </div>
  );
}
