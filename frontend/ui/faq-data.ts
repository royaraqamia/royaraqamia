import type { FAQItem } from './FAQAccordion';

/**
 * The FAQ content, kept out of the page because two things read it: the
 * accordion the visitor sees, and the `FAQPage` structured data the crawler
 * reads. One list means an edited answer cannot leave the JSON-LD stale.
 */
export const faqs: FAQItem[] = [
  {
    question: 'ما هي طرق الدَّفع المتاحة؟',
    answer: 'تطبيق ShamCash لِمَن هم داخل سوريا، أو تطبيق Efendim Pay لِمَن هم خارج سوريا.',
  },
  {
    question: 'ما العملات التي تقبلون الدَّفع بها؟',
    answer: 'الليرة السُّوريَّة أو الدُّولار أو اليورو.',
  },
  {
    question: 'هل الدَّفع بالتَّقسيط مُتاح فيما يخص خدمتَي البناء والتَّدريب؟',
    answer: `نعم.`,
  },
  {
    question: 'هل يتطلَّب التَّدريب خلفيَّة تقنيَّة',
    answer: `نعم.`,
  },
  {
    question: 'هل يتطلَّب التَّدريب خبرة مُسبقَة في مجالات مُحدَّدة',
    answer: `لا.`,
  },
];

// Generate FAQ Schema for SEO
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
