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
    <section className="section-spacing" id="testimonials">
      <div className="max-w-7xl mx-auto container-padding">
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              ماذا <span className="gradient-text">قالوا عنَّا</span>؟
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70"></p>
          </div>
        </ScrollAnimation>
      </div>

      {/* Testimonials Horizontal Scroll - Full Width with Edge Navigation */}
      <div className="relative w-full group/scroll">
        <HorizontalScrollArrows
          onScroll={scroll}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          ariaLabelLeft="التالي"
          ariaLabelRight="السابق"
        />

        {/* Edge Fade Gradients - Desktop (only show when there's content in that direction) */}
        {canScrollLeft && (
          <div
            className="hidden md:block absolute left-0 top-0 bottom-0 w-20 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to right, rgba(2, 6, 23, 0.9), transparent)' }}
          />
        )}
        {canScrollRight && (
          <div
            className="hidden md:block absolute right-0 top-0 bottom-0 w-20 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to left, rgba(2, 6, 23, 0.9), transparent)' }}
          />
        )}

        <div
          ref={scrollRef}
          className="horizontal-scroll pt-2 md:pt-4 pb-12 flex"
          style={{
            paddingLeft: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
            paddingRight: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
            scrollPaddingInline: '80px',
            gap: '16px',
          }}
          role="region"
          aria-label="آراء العملاء"
        >
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              tabIndex={0}
              className="scroll-snap-item testimonial-card group relative glass-card rounded-2xl card-padding glass-hover transition-all duration-300 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#7766EE] focus:ring-offset-2 focus:ring-offset-[#020617] flex flex-col"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedReview(index);
                }
              }}
            >
              {/* Content */}
              <div
                className="content-spacing relative z-10 cursor-pointer"
                onClick={() => setSelectedReview(index)}
                role="presentation"
              >
                <p className="text-foreground/80 leading-relaxed line-clamp-3 whitespace-normal break-words group-hover:text-foreground transition-colors duration-300">
                  &ldquo;{testimonial.content}&rdquo;
                </p>
                {/* Read More - Hidden on desktop, visible on hover; Always visible on mobile */}
                <div className="flex items-center gap-1 text-[#7766EE] text-sm mt-2 font-medium md:opacity-0 md:group-hover:opacity-100 transition-all duration-300">
                  <span>قراءة المزيد</span>
                  <CaretLeft className="w-4 h-4" />
                </div>
              </div>

              {/* Author */}
              <div className="flex items-center element-gap-sm relative z-10 mt-auto">
                <div
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden border-none ring-0 outline-none"
                  style={{
                    background: 'linear-gradient(135deg, #7766EE 0%, #A78BFA 100%)',
                  }}
                >
                  <UserCircle className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div className="font-semibold text-foreground">{testimonial.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Sheet */}
      {selectedReview !== null &&
        (() => {
          const review = testimonials[selectedReview];
          if (!review) return null;
          return (
            <>
              {/* Overlay */}
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
                onClick={closeReviewSheet}
                tabIndex={-1}
                role="presentation"
              />

              {/* Bottom Sheet */}
              <div
                className="review-bottom-sheet fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-[327px] max-h-[calc(100vh-100px)] bg-gradient-to-br from-[#020617] via-[#3b0764] to-[#0f172a] rounded-3xl shadow-2xl shadow-black/50 z-[9999] overflow-hidden flex flex-col animate-slide-up-bottom"
                role="dialog"
                aria-modal="true"
                aria-label={`رأي ${review.name}`}
              >
                {/* Header */}
                <div
                  className="px-4 py-3 border-b border-white/10 relative shrink-0 flex items-center justify-start"
                  dir="ltr"
                >
                  {/* Drag handle */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-white/20 rounded md:hidden" />

                  {/* Close button */}
                  <button
                    onClick={closeReviewSheet}
                    className="relative flex items-center justify-center p-0 bg-transparent border-none cursor-pointer text-white/80 hover:text-white transition-colors duration-200"
                    type="button"
                    aria-label="إغلاق"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Content */}
                <div className="custom-review-scrollbar p-6 overflow-y-auto flex-1 text-white/90">
                  <p className="text-base leading-relaxed mb-6 whitespace-pre-wrap">
                    &ldquo;{review.content}&rdquo;
                  </p>

                  {/* Author */}
                  <div className="flex items-center gap-4 pt-4 border-t border-white/10">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-[#7766EE] to-[#A78BFA] shadow-lg shadow-black/30">
                      <UserCircle className="w-7 h-7 text-white" />
                    </div>
                    <h4 className="font-bold text-white">{review.name}</h4>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
    </section>
  );
}
