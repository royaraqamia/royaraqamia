'use client';

import { useState, useMemo, useCallback, memo } from 'react';
import { CheckCircle2, ChevronLeft, UserRound } from 'lucide-react';
import { useHorizontalScroll } from '../shared/use-horizontal-scroll';
import { useUI } from '../state/UIContext';
import { HorizontalScrollArrows } from './HorizontalScrollArrows';
import { testimonials, type Testimonial } from '../../data/testimonials';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from './primitives/sheet';

// Deterministic pastel/vibrant gradient generator based on user name
const AVATAR_GRADIENTS = [
  'from-violet-600 via-indigo-600 to-purple-500',
  'from-fuchsia-600 via-purple-600 to-pink-500',
  'from-cyan-600 via-blue-600 to-indigo-500',
  'from-emerald-600 via-teal-600 to-cyan-500',
  'from-amber-600 via-orange-600 to-rose-500',
  'from-rose-600 via-pink-600 to-purple-500',
];

function getInitials(name: string): string {
  if (!name) return 'ع';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2);
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`;
}

function getGradientByName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index] ?? 'from-violet-600 via-indigo-600 to-purple-500';
}

interface TestimonialMeta {
  gradient: string;
  initials: string;
}

// Precomputed once at module load — no per-render hash/string work for every card
const TESTIMONIAL_META = new Map<string, TestimonialMeta>(
  testimonials.map((t) => [
    t.name,
    { gradient: getGradientByName(t.name), initials: getInitials(t.name) },
  ])
);

function getTestimonialMeta(name: string): TestimonialMeta {
  return (
    TESTIMONIAL_META.get(name) ?? {
      gradient: 'from-violet-600 via-indigo-600 to-purple-500',
      initials: 'ع',
    }
  );
}

// Micro-Component: Verified Customer Badge
function VerifiedBadge({ label = 'مُوثَّق' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shadow-xs">
      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

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
  const [isHovered, setIsHovered] = useState(false);
  const { gradient: gradientClass, initials } = getTestimonialMeta(testimonial.name);

  return (
    <article
      key={index}
      tabIndex={0}
      role="button"
      aria-haspopup="dialog"
      aria-expanded={isSelected}
      aria-controls="testimonials-review-sheet"
      aria-label={`مراجعة من ${testimonial.name}`}
      onClick={() => onOpen(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(index);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        group/card relative shrink-0 
        w-[82vw] sm:w-95 md:w-105 
        snap-start rounded-3xl p-6 sm:p-7 md:p-8 
        flex flex-col justify-between 
        bg-slate-900/95 hover:bg-slate-900
        border border-white/10 hover:border-violet-500/40 
        ring-1 ring-white/5 
        transition-[transform,box-shadow,border-color,background-color] duration-400 ease-out 
        hover:-translate-y-1.5 hover:shadow-[0_20px_40px_-15px_rgba(124,58,237,0.25)] 
        focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
        cursor-pointer overflow-hidden
      `}
    >
      {/* Dynamic Card Internal Glows */}
      <div
        className={`
          absolute -top-24 -right-24 w-48 h-48 rounded-full 
          bg-linear-to-br from-violet-500/15 via-purple-500/10 to-transparent 
          blur-2xl pointer-events-none transition-opacity duration-500
          ${isHovered ? 'opacity-100' : 'opacity-40'}
        `}
      />
      <div className="absolute inset-0 bg-linear-to-b from-white/4 to-transparent pointer-events-none" />

      {/* Body Content */}
      <div className="relative z-10 flex-1 flex flex-col justify-between my-1">
        <p className="text-slate-200 text-sm sm:text-base leading-relaxed line-clamp-4 font-normal tracking-wide group-hover/card:text-white transition-colors duration-300">
          {testimonial.content}
        </p>

        {/* Read More Inline Link / Action */}
        <div className="inline-flex items-center gap-1.5 text-violet-400 group-hover/card:text-violet-300 text-xs sm:text-sm font-medium mt-4 transition-colors">
          <span>قراءة التَّقييم بالكامل</span>
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
              shadow-lg ring-2 ring-white/15 shrink-0
            `}
          >
            {initials || <UserRound className="w-5 h-5" />}
          </div>

          {/* User Name & Metadata */}
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-slate-100 text-sm sm:text-base truncate group-hover/card:text-violet-200 transition-colors">
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

export function TestimonialsCarousel({
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

  const openReviewSheet = useCallback(
    (index: number) => {
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
      className="relative w-full py-8 md:py-14 overflow-hidden select-none"
    >
      {/* Background Ambience & Lighting Glow — three overlapping pre-blurred
          halos recreate the violet→indigo→fuchsia wash without live filters */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 md:w-250 h-87.5 pointer-events-none -z-10"
        aria-hidden="true"
      >
        <div className="absolute inset-y-0 left-0 w-2/3 text-violet-600/10 glow-orb rounded-full" />
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-2/3 text-indigo-500/10 glow-orb rounded-full" />
        <div className="absolute inset-y-0 right-0 w-2/3 text-fuchsia-600/10 glow-orb rounded-full" />
      </div>

      {/* Main Carousel Wrapper with Edge Navigation Controls */}
      <div className="relative w-full group/carousel">
        <HorizontalScrollArrows
          onScroll={scroll}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          ariaLabelLeft="التَّالي"
          ariaLabelRight="السَّابق"
        />

        {/* Scrollable Track */}
        <div
          ref={scrollRef}
          role="region"
          aria-label="آراء وتجارب العملاء"
          tabIndex={0}
          className="horizontal-scroll testimonials-scroll-track pt-4 pb-10 flex items-stretch overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
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

      {/* Expanded Modal View (Mobile Sheet + Desktop Glass Dialog) */}
      <Sheet
        open={selectedReviewIndex !== null}
        onOpenChange={(open) => {
          if (!open) closeReviewSheet();
        }}
      >
        <SheetContent
          id="testimonials-review-sheet"
          side="bottom"
          className="gap-0 p-0 max-h-[90vh] left-3 right-3 bottom-3 sm:left-6 sm:right-6 sm:bottom-6 rounded-3xl border border-white/15 bg-slate-950/95 text-slate-100 shadow-[0_25px_70px_rgba(0,0,0,0.85)] md:left-1/2 md:right-auto md:-translate-x-1/2 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:w-full md:max-w-xl md:rounded-3xl overflow-hidden focus:outline-none"
        >
          {/* Subtle Modal Ambient Accent */}
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-linear-to-r from-violet-500 via-fuchsia-500 to-indigo-500" />
          <div className="absolute -top-20 -right-20 w-52 h-52 rounded-full text-violet-600/20 glow-orb pointer-events-none" />

          {/* Mobile Handle Indicator */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/20 rounded-full md:hidden" />

          {activeReview && (
            <>
              <SheetTitle className="sr-only">تقييم من {activeReview.name}</SheetTitle>
              <SheetDescription className="sr-only">
                التَّقييم الكامل من {activeReview.name}
              </SheetDescription>

              <div className="relative p-6 sm:p-8 flex flex-col justify-between max-h-[calc(90vh-1rem)] overflow-y-auto">
                {/* Expanded Review Content */}
                <div className="my-6 relative">
                  <p className="text-base sm:text-lg text-slate-100 leading-relaxed font-normal whitespace-pre-line select-text">
                    {activeReview.content}
                  </p>
                </div>

                {/* Detailed Author Profile Footer */}
                <div className="flex items-center justify-between gap-4 pt-5 border-t border-white/10 bg-white/2 -mx-6 -mb-6 px-6 pb-6 sm:-mx-8 sm:-mb-8 sm:px-8 sm:pb-8 rounded-b-3xl">
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`
                        w-12 h-12 sm:w-13 sm:h-13 rounded-full 
                        bg-linear-to-tr ${getTestimonialMeta(activeReview.name).gradient}
                        flex items-center justify-center 
                        text-white font-bold text-base sm:text-lg 
                        shadow-xl ring-2 ring-white/20 shrink-0
                      `}
                    >
                      {getTestimonialMeta(activeReview.name).initials || (
                        <UserRound className="w-5 h-5" />
                      )}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <h3 className="font-bold text-base sm:text-lg text-white truncate">
                        {activeReview.name}
                      </h3>
                    </div>
                  </div>

                  <VerifiedBadge label="مُوثَّق" />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
