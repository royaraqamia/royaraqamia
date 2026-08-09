'use client';

import { useState } from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { ScrollAnimation } from './ScrollAnimations';
import { WHATSAPP_PHONE } from '@/frontend/shared/constants';

interface FAQItem {
  question: string;
  answer: string;
  category?: string;
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-87.5 bg-violet-600/10 blur-[120px] rounded-full pointer-events-none -z-10" />
        <div className="absolute top-1/3 right-10 w-75 h-50 bg-fuchsia-600/5 blur-[100px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <ScrollAnimation animation="slide-down" duration={0.7}>
            <div className="text-center flex flex-col items-center mb-12 sm:mb-16">
              {/* Pill Context Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs sm:text-sm font-medium tracking-wide mb-4 backdrop-blur-md shadow-xs">
                <CircleHelp className="w-4 h-4 text-violet-400 shrink-0" />
                <span>إجابات</span>
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                <span className="bg-linear-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
                  الأسئلة
                </span>{' '}
                الشَّائعة
              </h2>
              <p className="mt-3.5 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
                كل ما تحتاج معرفته عنَّا.
              </p>
            </div>
          </ScrollAnimation>

          {/* FAQ Accordion List */}
          <div className="flex flex-col gap-3.5 sm:gap-4">
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
                      group relative rounded-2xl transition-all duration-300 ease-out overflow-hidden border
                      ${
                        isOpen
                          ? 'bg-card/90 border-violet-500/40 shadow-[0_12px_32px_-12px_rgba(124,58,237,0.22)] backdrop-blur-xl'
                          : 'bg-card/40 hover:bg-card/70 border-border/60 hover:border-border backdrop-blur-md'
                      }
                    `}
                  >
                    {/* Top Glow Edge Line for Active State */}
                    {isOpen && (
                      <div className="absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-violet-500/60 to-transparent pointer-events-none" />
                    )}

                    <button
                      type="button"
                      id={`faq-question-${index}`}
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                      className="relative w-full px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between gap-4 text-right cursor-pointer outline-none transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl active:scale-[0.995]"
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${index}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {faq.category && (
                          <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
                            {faq.category}
                          </span>
                        )}
                        <span
                          className={`
                            text-base sm:text-lg font-semibold leading-relaxed transition-colors duration-200 select-none
                            ${
                              isOpen
                                ? 'text-violet-400 dark:text-violet-300'
                                : 'text-foreground/90 group-hover:text-foreground'
                            }
                          `}
                        >
                          {faq.question}
                        </span>
                      </div>

                      <div
                        className={`
                          shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-300
                          ${
                            isOpen
                              ? 'bg-violet-600 text-white rotate-180 shadow-md shadow-violet-600/30 ring-2 ring-violet-500/20'
                              : 'bg-muted/80 text-muted-foreground group-hover:bg-muted group-hover:text-foreground'
                          }
                        `}
                      >
                        <ChevronDown className="w-5 h-5 transition-transform duration-300" />
                      </div>
                    </button>

                    <div
                      id={`faq-answer-${index}`}
                      role="region"
                      aria-labelledby={`faq-question-${index}`}
                      className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                        isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div
                          className={`px-5 sm:px-6 pb-5 sm:pb-6 pt-1 transition-all duration-300 ${
                            isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
                          }`}
                        >
                          <div className="w-full h-px bg-linear-to-r from-transparent via-border/60 to-transparent mb-4 sm:mb-5" />
                          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground/90 select-text font-normal">
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
