import type { FAQItem } from './FAQAccordion';

/**
 * The FAQ content, kept out of the page because two things read it: the
 * accordion the visitor sees, and the `FAQPage` structured data the crawler
 * reads. One list means an edited answer cannot leave the JSON-LD stale.
 *
 * The last four entries moved here from the pricing page, which now sells the
 * two plans and leaves the questions to this one list.
 */
export const faqs: FAQItem[] = [
  {
    question: 'أين أنتم؟',
    answer: 'في بلاد الشَّام، تحديدًا في مدينة حَلَب.',
  },
  {
    question: 'ما هي طرق الدَّفع المتاحة؟',
    answer: 'تطبيق ShamCash لِمَن هم داخل سوريا، أو تطبيق Efendim Pay لِمَن هم خارج سوريا.',
  },
  {
    question: 'ما العملات التي تقبلون الدَّفع بها؟',
    answer: 'الليرة السُّوريَّة أو الدُّولار أو اليورو.',
  },
  {
    question: 'متى يبدأ الاشتراك؟',
    answer: 'بعد تأكيد الدَّفعة مباشرة. يحصل حسابك على رصيد كامل جديد لمدة 30 يومًا.',
  },
  {
    question: 'ماذا يحدث عند انتهاء مدَّة الاشتراك؟',
    answer:
      'تعود تلقائياً إلى الخطة المجانيَّة برصيد جديد. لا يوجد تجديد تلقائي، ولا تُحذف بياناتك.',
  },
  {
    question: 'هل أفقد بياناتي إذا لم أجدِّد الاشتراك؟',
    answer:
      'لا. تنخفض حدود الحفظ فقط، وتبقى كل العناصر التي أنشأتها؛ يمكنك التَّعديل والحذف، لكن لا يمكنك إضافة ما يتجاوز الحد حتَّى ترقّي الخطة أو تحذف.',
  },
  {
    question: 'هل يمكنني استخدام التَّطبيق دون حساب؟',
    answer:
      'نعم، ومع رصيد محدود. الحساب المجَّاني يمنحك رصيدًا شهريًّا أكبر ويحفظ بياناتك على كل أجهزتك.',
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
