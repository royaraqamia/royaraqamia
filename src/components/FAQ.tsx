import { useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';

interface FAQItem {
  question: string;
  answer: string;
  category?: string;
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FAQItem[] = [
    {
      question: 'ماذا تقدِّمون؟',
      answer: 'تدريب، استشارات، تشبيك، دفع إلكتروني، نظام التَّسعير، نظام الرَّد، تطوير المواقع والتَّطبيقات، نظام الصَّرافة والحوَّالات.',
      category: 'عام',
    },
    {
      question: 'ما هي طرق الدَّفع المتاحة؟',
      answer: 'تطبيق Sham Cash داخل سوريا، وتطبيق Yasmin خارج سوريا.',
      category: 'عام',
    },
    {
      question: 'كيف يمكنني التَّواصل معكم؟',
      answer: 'يمكنك التَّواصل معنا مباشرةً عبر واتساب (963968478904+).',
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
        className="section-spacing bg-muted/30"
        style={{ contentVisibility: 'auto' }}
      >
        <div className="max-w-4xl mx-auto container-padding">
          {/* Header */}
          <ScrollAnimation animation="slide-down" duration={0.7}>
            <div className="text-center section-header">
              <h2
                className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
                style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
              >
                <span className="gradient-text">الأسئلة</span> الشَّائعة
              </h2>
            </div>
          </ScrollAnimation>

          {/* FAQ Items */}
          <div className="element-gap-sm flex flex-col">
            {faqs.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <ScrollAnimation
                  key={index}
                  animation="slide-up"
                  delay={index * 0.05}
                  duration={0.5}
                >
                  <div
                    className={`
                      group relative rounded-2xl overflow-hidden transition-all duration-500 ease-out
                      ${
                        isOpen
                          ? 'bg-white/5 border border-violet-500/30 shadow-[0_0_30px_-10px_rgba(124,58,237,0.3)]'
                          : 'glass-card border border-transparent hover:bg-white/[0.02]'
                      }
                    `}
                  >
                    {/* Active State Gradient Border/Glow effect */}
                    {isOpen && (
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/5 pointer-events-none" />
                    )}

                    <button
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                      className="relative w-full px-6 py-5 md:py-6 flex items-start md:items-center justify-between text-right gap-6 outline-none"
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${index}`}
                    >
                      <span
                        className={`
                        text-base md:text-lg font-medium flex-1 leading-relaxed transition-colors duration-300
                        ${isOpen ? 'text-primary gradient-text font-semibold' : 'text-foreground/90 group-hover:text-foreground'}
                      `}
                      >
                        {faq.question}
                      </span>

                      <div
                        className={`
                        flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-500
                        ${
                          isOpen
                            ? 'bg-primary text-white rotate-180 shadow-lg shadow-primary/25'
                            : 'bg-white/5 text-foreground/50 group-hover:bg-white/10 group-hover:text-foreground'
                        }
                      `}
                      >
                        <CaretDown className="w-5 h-5 md:w-6 md:h-6" />
                      </div>
                    </button>

                    <div
                      id={`faq-answer-${index}`}
                      className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                    >
                      <div className="overflow-hidden">
                        <div
                          className={`px-6 pb-8 pt-2 transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                        >
                          {/* Divider */}
                          <div className="w-full h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent mb-4" />

                          <p className="text-slate-300 leading-relaxed text-sm md:text-base">
                            {faq.answer}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollAnimation>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
