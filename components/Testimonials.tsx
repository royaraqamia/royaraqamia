'use client';

import { X, UserCircle, CaretLeft } from '@phosphor-icons/react';
import { useState, useEffect, useCallback } from 'react';
import { ScrollAnimation } from './ScrollAnimations';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';
import { useUI } from '../context/UIContext';
import { HorizontalScrollArrows } from './HorizontalScrollArrows';
import { testimonials } from '../data/testimonials';

export function Testimonials() {
  const { setIsReviewSheetOpen } = useUI();
  const {
    scrollContainerRef: scrollRef,
    canScrollLeft,
    canScrollRight,
    scroll,
  } = useHorizontalScroll(412);
  const [selectedReview, setSelectedReview] = useState<number | null>(null);

  // Sync with global UI state
  useEffect(() => {
    setIsReviewSheetOpen(selectedReview !== null);
  }, [selectedReview, setIsReviewSheetOpen]);

  // Lock body scroll when bottom sheet is open
  useEffect(() => {
    if (selectedReview === null) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;

    const navbar = document.querySelector('nav[role="navigation"]');
    if (navbar instanceof HTMLElement) {
      navbar.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';

      if (navbar instanceof HTMLElement) {
        navbar.style.paddingRight = '';
      }

      setIsReviewSheetOpen(false);
    };
  }, [selectedReview, setIsReviewSheetOpen]);

  const closeReviewSheet = useCallback(() => {
    setSelectedReview(null);
    setIsReviewSheetOpen(false);
  }, [setIsReviewSheetOpen]);

  // Handle keyboard events for closing the review sheet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeReviewSheet();
      }
    };

    if (selectedReview !== null) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedReview, closeReviewSheet]);

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
                  <CaretLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" />
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
                  <UserCircle className="w-6 h-6 md:w-7 md:h-7 text-white" />
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

      {/* Bottom Sheet / Dialog Modal */}
      {selectedReview !== null &&
        (() => {
          const review = testimonials[selectedReview];
          if (!review) return null;
          return (
            <>
              {/* Backdrop Overlay */}
              <div
                className="fixed inset-0 bg-black/75 backdrop-blur-md z-9998 transition-opacity duration-300"
                onClick={closeReviewSheet}
                tabIndex={-1}
                role="presentation"
              />

              {/* Modal Container */}
              <div
                className="review-bottom-sheet fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg max-h-[85vh] md:bottom-auto md:top-1/2 md:-translate-y-1/2 bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 rounded-t-3xl md:rounded-3xl border border-white/15 shadow-2xl shadow-black/80 z-9999 overflow-hidden flex flex-col"
                role="dialog"
                aria-modal="true"
                aria-label={`رأي ${review.name}`}
              >
                {/* Modal Header */}
                <div
                  className="px-5 py-3.5 border-b border-white/10 relative shrink-0 flex items-center justify-between bg-slate-950/60 backdrop-blur-sm"
                  dir="ltr"
                >
                  {/* Mobile Drag Indicator */}
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full md:hidden" />

                  {/* Close Button */}
                  <button
                    onClick={closeReviewSheet}
                    className="relative flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 cursor-pointer text-slate-300 hover:text-white transition-all duration-200 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    type="button"
                    aria-label="إغلاق"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="custom-review-scrollbar p-6 sm:p-8 overflow-y-auto flex-1 text-slate-200 flex flex-col justify-between">
                  <div className="mb-6">
                    <span className="text-violet-400/40 text-4xl font-serif leading-none select-none block mb-2">
                      &ldquo;
                    </span>
                    <p className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap text-slate-100 font-normal">
                      {review.content}
                    </p>
                  </div>

                  {/* Author Information */}
                  <div className="flex items-center gap-4 pt-5 border-t border-white/10">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-linear-to-br from-[#7766EE] to-[#A78BFA] shadow-lg shadow-black/40 ring-2 ring-violet-400/30">
                      <UserCircle className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base sm:text-lg text-white">{review.name}</h3>
                      <p className="text-xs text-violet-300/80 font-medium">مُوثَّق</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
    </section>
  );
}
