'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ScrollArrowsProps {
  onScroll: (direction: 'left' | 'right') => void;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  ariaLabelLeft?: string;
  ariaLabelRight?: string;
}

const arrowBase =
  'hidden md:flex absolute top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full items-center justify-center border cursor-pointer transition-all duration-300 hover:scale-110 bg-black/60 hover:bg-[#7766EE] border-white/15 hover:border-[#7766EE]';

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
          style={{ backdropFilter: 'blur(8px)' }}
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
          style={{ backdropFilter: 'blur(8px)' }}
          aria-label={ariaLabelRight}
          type="button"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}
    </>
  );
}
