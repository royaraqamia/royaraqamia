'use client';

import { CircleUser, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { ScrollAnimation } from './ScrollAnimations';
import { useHorizontalScroll } from '../shared/use-horizontal-scroll';
import { useUI } from '../state/UIContext';
import { HorizontalScrollArrows } from './HorizontalScrollArrows';
import { testimonials } from '../../data/testimonials';
import { Sheet, SheetContent } from './primitives/sheet';

export function Testimonials() {
  const { setIsReviewSheetOpen } = useUI();
  const {
    scrollContainerRef: scrollRef,
    canScrollLeft,
    canScrollRight,
    scroll,
  } = useHorizontalScroll(412);
  const [selectedReview, setSelectedReview] = useState<number | null>(null);

  const closeReviewSheet = () => {
    setSelectedReview(null);
    setIsReviewSheetOpen(false);
  };

  return (
    <section className="relative py-16 sm:py-24 lg:py-32 overflow-hidden" id="testimonials">
      {/* Background Subtle Ambient Glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
        <div className="h-87.5 w-125 sm:h-112.5 sm:w-175 rounded-full bg-violet-600/10 blur-[120px] transform-gpu" />
      </div>

      {/* Section Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10 sm:mb-14">
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto flex flex-col items-center">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs font-semibold text-violet-400 mb-4 backdrop-blur-md shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span>آراء النَّاس</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
              ماذا{' '}
              <span className="bg-linear-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                قالوا عنَّا
              </span>
              ؟
            </h2>
            <p className="mt-3 text-sm sm:text-base lg:text-lg text-foreground/70 max-w-2xl leading-relaxed">
              تجارب حقيقيَّة ورؤى صادقة من زبائننا حول ما نُقدِّم
            </p>
          </div>
        </ScrollAnimation>
      </div>

      {/* Testimonials Horizontal Scroll - Full Width with Edge Navigation */}
      <div className="relative w-full group/scroll">
        <HorizontalScrollArrows
          onScroll={scroll}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          ariaLabelLeft="التَّالي"
          ariaLabelRight="السَّابق"
        />

        <div
          ref={scrollRef}
          className="horizontal-scroll pt-2 sm:pt-4 pb-12 flex overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth"
          style={{
            paddingLeft: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
            paddingRight: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
            scrollPaddingInline: '80px',
            gap: '20px',
          }}
          role="region"
          aria-label="آراء النَّاس"
        >
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              tabIndex={0}
              role="button"
              aria-haspopup="dialog"
              aria-expanded={selectedReview === index}
              aria-label={`رأي ${testimonial.name}`}
              className="scroll-snap-item group relative w-70 sm:w-90 md:w-103 shrink-0 bg-slate-900/60 backdrop-blur-xl border border-white/10 hover:border-violet-500/40 rounded-2xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 ease-out hover:shadow-2xl hover:shadow-violet-500/10 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 cursor-pointer overflow-hidden select-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedReview(index);
                }
              }}
            >
              {/* Card Ambient Glow Effect */}
              <div className="absolute inset-0 bg-linear-to-br from-violet-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              {/* Content */}
              <div
                className="relative z-10 flex flex-col flex-1 justify-between gap-4 cursor-pointer"
                onClick={() => setSelectedReview(index)}
                role="presentation"
              >
                <div>
                  <span className="text-violet-400/40 text-3xl font-serif leading-none select-none block mb-1">
                    &ldquo;
                  </span>
                  <p className="text-slate-200 text-sm sm:text-base leading-relaxed line-clamp-3 whitespace-normal wrap-break-word group-hover:text-white transition-colors duration-300">
                    {testimonial.content}
                  </p>
                </div>

                {/* Read More Trigger */}
                <div className="flex items-center gap-1.5 text-violet-400 group-hover:text-violet-300 text-xs sm:text-sm font-semibold mt-2 transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
                  <span>قراءة المزيد</span>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" />
                </div>
              </div>

              {/* Author Footer */}
              <div className="flex items-center gap-3.5 relative z-10 mt-6 pt-5 border-t border-white/10">
                <div
                  className="w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg overflow-hidden ring-2 ring-violet-400/20"
                  style={{
                    background: 'linear-gradient(135deg, #7766EE 0%, #A78BFA 100%)',
                  }}
                >
                  <CircleUser className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-slate-100 text-sm sm:text-base truncate">
                    {testimonial.name}
                  </span>
                  <span className="text-xs text-slate-400">مُوثَّق</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Sheet (mobile) / Dialog (desktop) */}
      <Sheet
        open={selectedReview !== null}
        onOpenChange={(open) => {
          if (!open) closeReviewSheet();
        }}
      >
        <SheetContent
          side="bottom"
          className="gap-0 p-0 max-h-[85vh] left-4 right-4 bottom-4 rounded-3xl border-0 bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-200 shadow-2xl shadow-black/80 md:left-1/2 md:right-auto md:-translate-x-1/2 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:max-w-lg md:rounded-3xl md:border md:border-white/15"
        >
          {/* Mobile Drag Indicator */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full md:hidden z-1" />

          {/* Content */}
          <div className="custom-review-scrollbar p-6 sm:p-8 overflow-y-auto flex-1 text-slate-200 flex flex-col justify-between max-h-[calc(85vh-1px)]">
            {(() => {
              const review = selectedReview !== null ? testimonials[selectedReview] : null;
              if (!review) return null;
              return (
                <>
                  <div className="mb-6">
                    <span className="text-violet-400/40 text-4xl font-serif leading-none select-none block mb-2">
                      &ldquo;
                    </span>
                    <p className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap text-slate-100 font-normal">
                      {review.content}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 pt-5 border-t border-white/10">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-linear-to-br from-[#7766EE] to-[#A78BFA] shadow-lg shadow-black/40 ring-2 ring-violet-400/30">
                      <CircleUser className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base sm:text-lg text-white">{review.name}</h3>
                      <p className="text-xs text-violet-300/80 font-medium">مُوثَّق</p>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
