'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ScrollArrowsProps {
  onScroll: (direction: 'left' | 'right') => void;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  ariaLabelLeft?: string;
  ariaLabelRight?: string;
}

/**
 * The row's edge arrows. The display pair is `max-md:hidden md:flex`, never
 * `hidden md:flex`: two variants cannot be outranked by each other unless they
 * overlap, so the pair holds whatever order the shell's and the surface's
 * stylesheets end up in (ADR-0132).
 */
const arrowBase =
  'max-md:hidden md:flex absolute top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full items-center justify-center border cursor-pointer transition-safe duration-300 hover:scale-110 bg-black/60 hover:bg-[#7766EE] border-white/15 hover:border-[#7766EE]';

export function HorizontalScrollArrows({
  onScroll,
  canScrollLeft,
  canScrollRight,
  ariaLabelLeft = 'التالي',
  ariaLabelRight = 'السابق',
}: ScrollArrowsProps) {
  return (
    <>
      {canScrollLeft && (
        <button
          onClick={() => onScroll('left')}
          className={`${arrowBase} inset-e-4`}
          aria-label={ariaLabelLeft}
          type="button"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => onScroll('right')}
          className={`${arrowBase} inset-s-4`}
          aria-label={ariaLabelRight}
          type="button"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}
    </>
  );
}
