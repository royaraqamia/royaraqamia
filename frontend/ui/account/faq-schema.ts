import { faqs } from './faq-view';

/**
 * The FAQ's `FAQPage` structured data, built from the one list the page draws.
 *
 * It lives beside the view rather than in the page so the crawler's copy and the
 * visitor's copy cannot part ways: both read [faqs].
 */
export const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};
