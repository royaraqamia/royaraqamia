'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ScrollAnimation } from './ScrollAnimations';

export interface FAQItem {
  question: string;
  answer: string;
  category?: string;
}

interface FAQAccordionProps {
  faqs: FAQItem[];
}

export function FAQAccordion({ faqs }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-3.5 sm:gap-4">
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;
        return (
          <ScrollAnimation key={index} animation="slide-up" delay={index * 0.05} duration={0.5}>
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
  );
}
