'use client';

import { useState, useMemo, useCallback, memo } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, UserRound } from 'lucide-react';
import { useHorizontalScroll } from '../shared/use-horizontal-scroll';
import { useUI } from '../state/UIContext';
import { HorizontalScrollArrows } from './HorizontalScrollArrows';
import { tolerateChunkFailure } from './shared/lazy-chunk';
import { getTestimonialMeta, VerifiedBadge } from './testimonials-meta';
import { testimonials, type Testimonial } from '../../data/testimonials';

const loadReviewDialog = () =>
  import('./TestimonialReviewDialog').then((m) => ({ default: m.TestimonialReviewDialog }));

/**
 * The expanded review, kept off the initial graph. The carousel is fully
 * interactive without it — the dialog primitive (portal, focus scope, scroll
 * lock) is fetched when a card is hovered or opened.
 */
const LazyReviewDialog = dynamic(
  tolerateChunkFailure('testimonial review dialog', loadReviewDialog),
  { ssr: false, loading: () => null }
);

interface TestimonialCardProps {
  testimonial: Testimonial;
  index: number;
  isSelected: boolean;
  onOpen: (index: number) => void;
}

// Isolated memoized card — hover state lives here, so hovering/re-rendering one
// card never re-renders the whole list.
const TestimonialCard = memo(function TestimonialCard({
  testimonial,
  index,
  isSelected,
  onOpen,
}: TestimonialCardProps) {
  const { gradient: gradientClass, initials } = getTestimonialMeta(testimonial.name);

  return (
    <article
      key={index}
      tabIndex={0}
      role="button"
      aria-haspopup="dialog"
      aria-expanded={isSelected}
      aria-label={`مراجعة من ${testimonial.name}`}
      onClick={() => onOpen(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(index);
        }
      }}
      className={`
        group/card relative shrink-0 
        w-[82vw] sm:w-95 md:w-105 
        snap-start rounded-3xl p-6 sm:p-7 md:p-8 
        flex flex-col justify-between 
        bg-neutral-900/70 hover:bg-neutral-900
        border border-white/10 hover:border-violet-500/40 
        ring-1 ring-white/5 
        transition-[border-color,background-color] duration-400 ease-out 
        focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950
        cursor-pointer overflow-hidden
      `}
    >
      {/* Body Content */}
      <div className="relative z-10 flex-1 flex flex-col justify-between my-1">
        <p className="text-slate-200 text-sm sm:text-base leading-relaxed line-clamp-4 font-normal tracking-wide group-hover/card:text-white transition-colors duration-300">
          {testimonial.content}
        </p>

        {/* Read More Inline Link / Action */}
        <div className="inline-flex items-center gap-1.5 text-violet-400 group-hover/card:text-violet-300 text-xs sm:text-sm font-medium mt-4 transition-colors">
          <span>قراءة التَّقييم بالكامل</span>
          <ChevronLeft className="w-4 h-4 transition-transform duration-300 group-hover/card:-translate-x-1" />
        </div>
      </div>

      {/* Author Footer */}
      <div className="relative z-10 mt-6 pt-5 border-t border-white/8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* User Avatar */}
          <div
            className={`
              w-11 h-11 sm:w-12 sm:h-12 rounded-full 
              bg-linear-to-tr ${gradientClass}
              flex items-center justify-center 
              text-white font-bold text-sm sm:text-base 
              ring-2 ring-white/15 shrink-0
            `}
          >
            {initials || <UserRound className="w-5 h-5" />}
          </div>

          {/* User Name & Metadata */}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-100 text-sm sm:text-base truncate group-hover/card:text-violet-200 transition-colors">
              {testimonial.name}
            </span>
          </div>
        </div>

        {/* Verified Badge */}
        <div className="shrink-0">
          <VerifiedBadge />
        </div>
      </div>
    </article>
  );
});

interface TestimonialsCarouselProps {
  headingId?: string;
}

export const TestimonialsCarousel = memo(function TestimonialsCarousel({
  headingId = 'testimonials-heading',
}: TestimonialsCarouselProps) {
  const { setIsReviewSheetOpen } = useUI();

  const {
    scrollContainerRef: scrollRef,
    canScrollLeft,
    canScrollRight,
    scroll,
  } = useHorizontalScroll(420);

  const [selectedReviewIndex, setSelectedReviewIndex] = useState<number | null>(null);
  // The dialog is mounted on first open and stays mounted, so its close
  // animation still runs; the chunk itself is prefetched on first intent.
  const [isReviewDialogMounted, setIsReviewDialogMounted] = useState(false);

  const prefetchReviewDialog = useCallback(() => {
    void loadReviewDialog().catch(() => {});
  }, []);

  const openReviewSheet = useCallback(
    (index: number) => {
      setIsReviewDialogMounted(true);
      setSelectedReviewIndex(index);
      setIsReviewSheetOpen(true);
    },
    [setIsReviewSheetOpen]
  );

  const closeReviewSheet = useCallback(() => {
    setSelectedReviewIndex(null);
    setIsReviewSheetOpen(false);
  }, [setIsReviewSheetOpen]);

  const activeReview = useMemo(() => {
    if (selectedReviewIndex === null) return null;
    const review = testimonials[selectedReviewIndex];
    if (!review) return null;
    return review;
  }, [selectedReviewIndex]);

  return (
    <section
      aria-labelledby={headingId}
      className="relative w-full pb-8 md:pb-14 overflow-hidden select-none"
    >
      {/* Main Carousel Wrapper with Edge Navigation Controls */}
      <div className="relative w-full group/carousel">
        <HorizontalScrollArrows
          onScroll={scroll}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          ariaLabelLeft="التَّالي"
          ariaLabelRight="السَّابق"
        />

        {/* Scrollable Track */}
        <div
          ref={scrollRef}
          role="region"
          aria-label="آراء وتجارب العملاء"
          tabIndex={0}
          onPointerEnter={prefetchReviewDialog}
          onFocus={prefetchReviewDialog}
          className="horizontal-scroll testimonials-scroll-track pb-10 flex items-stretch overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
        >
          {testimonials.map((testimonial, index) => (
            <TestimonialCard
              key={index}
              testimonial={testimonial}
              index={index}
              isSelected={selectedReviewIndex === index}
              onOpen={openReviewSheet}
            />
          ))}
        </div>
      </div>
      {/* Expanded review — the chunk is fetched on first intent, mounted on first open */}
      {isReviewDialogMounted && (
        <LazyReviewDialog
          review={activeReview}
          open={selectedReviewIndex !== null}
          onClose={closeReviewSheet}
        />
      )}
    </section>
  );
});
