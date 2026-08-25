import { ScrollAnimation } from './ScrollAnimations';
import { FAQAccordion, type FAQItem } from './FAQAccordion';
import { WHATSAPP_PHONE } from '@/frontend/shared/constants';

const faqs: FAQItem[] = [
  {
    question: 'ما هي طرق الدَّفع المتاحة؟',
    answer: 'تطبيق ShamCash لِمَن هم داخل سوريا، أو منصَّة MoneyGram لِمَن هم خارج سوريا.',
    category: 'عام',
  },
  {
    question: 'ما العملات التي تقبلون الدَّفع بها؟',
    answer: 'نقبل الدَّفع بالليرة السُّوريَّة الجديدة أو الدُّولار.',
    category: 'عام',
  },
  {
    question: 'كيف يمكنني طلب أحد خدماتكم؟',
    answer: `من خلال التَّواصل معنا مباشرةً عبر واتساب (${WHATSAPP_PHONE}+).`,
    category: 'عام',
  },
];

// Generate FAQ Schema for SEO
const faqSchema = {
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

export function FAQ() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema),
        }}
      />

      <section
        id="faq"
        className="relative py-20 sm:py-28 lg:py-32 bg-background/50 overflow-hidden"
        style={{ contentVisibility: 'auto' }}
      >
        {/* Ambient Radial Background Glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-87.5 bg-violet-600/10 glow-blur-lg rounded-full pointer-events-none -z-10" />
        <div className="absolute top-1/3 right-10 w-75 h-50 bg-fuchsia-600/5 glow-blur-md rounded-full pointer-events-none -z-10" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <ScrollAnimation animation="slide-down" duration={0.7}>
            <div className="text-center flex flex-col items-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                <span className="bg-linear-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
                  الأسئلة
                </span>{' '}
                الشَّائعة
              </h2>
            </div>
          </ScrollAnimation>

          {/* FAQ Accordion List — interactive island */}
          <FAQAccordion faqs={faqs} />
        </div>
      </section>
    </>
  );
}
