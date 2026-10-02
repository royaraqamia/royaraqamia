import { ScrollAnimation } from './ScrollAnimations';
import { FAQAccordion, type FAQItem } from './FAQAccordion';
import { SectionTitle, SectionTitleHighlight } from './shared/section-title';

const faqs: FAQItem[] = [
  {
    question: 'ما هي طرق الدَّفع المتاحة؟',
    answer: 'تطبيق ShamCash لِمَن هم داخل سوريا، أو تطبيق Efendim Pay لِمَن هم خارج سوريا.',
  },
  {
    question: 'ما العملات التي تقبلون الدَّفع بها؟',
    answer: 'الليرة السُّوريَّة أو الدُّولار أو اليورو.',
  },
  {
    question: 'هل الدَّفع بالتَّقسيط مُتاح فيما يخص خدمتَي البناء والتَّدريب؟',
    answer: `نعم.`,
  },
  {
    question: 'هل يتطلَّب التَّدريب خلفيَّة تقنيَّة',
    answer: `نعم.`,
  },
  {
    question: 'هل يتطلَّب التَّدريب خبرة مُسبقَة في مجالات مُحدَّدة',
    answer: `لا.`,
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <ScrollAnimation animation="slide-down" duration={0.7}>
            <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
              <SectionTitle>
                <SectionTitleHighlight>الأسئلة</SectionTitleHighlight> الشَّائعة
              </SectionTitle>
            </div>
          </ScrollAnimation>

          {/* FAQ Accordion List — interactive island */}
          <FAQAccordion faqs={faqs} />
        </div>
      </section>
    </>
  );
}
