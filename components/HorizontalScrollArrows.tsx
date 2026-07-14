'use client';

import { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';

interface ScrollArrowsProps {
  onScroll: (direction: 'left' | 'right') => void;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  ariaLabelLeft?: string;
  ariaLabelRight?: string;
}

export function HorizontalScrollArrows({
  onScroll,
  canScrollLeft,
  canScrollRight,
  ariaLabelLeft = 'التالي',
  ariaLabelRight = 'السابق',
}: ScrollArrowsProps) {
  const [hoveredArrow, setHoveredArrow] = useState<'left' | 'right' | null>(null);

  const arrowBase =
    'hidden md:flex absolute top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full items-center justify-center border cursor-pointer transition-all duration-300 hover:scale-110';

  const getArrowStyle = (direction: 'left' | 'right') => ({
    backgroundColor: hoveredArrow === direction ? '#7766EE' : 'rgba(0, 0, 0, 0.6)',
    borderColor: hoveredArrow === direction ? '#7766EE' : 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(8px)',
  });

  return (
    <>
      {canScrollLeft && (
        <button
          onClick={() => onScroll('left')}
          className={`${arrowBase} left-4`}
          style={getArrowStyle('left')}
          onMouseEnter={() => setHoveredArrow('left')}
          onMouseLeave={() => setHoveredArrow(null)}
          aria-label={ariaLabelLeft}
          type="button"
        >
          <CaretLeft className="w-6 h-6 text-white" />
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => onScroll('right')}
          className={`${arrowBase} right-4`}
          style={getArrowStyle('right')}
          onMouseEnter={() => setHoveredArrow('right')}
          onMouseLeave={() => setHoveredArrow(null)}
          aria-label={ariaLabelRight}
          type="button"
        >
          <CaretRight className="w-6 h-6 text-white" />
        </button>
      )}
    </>
  );
}
