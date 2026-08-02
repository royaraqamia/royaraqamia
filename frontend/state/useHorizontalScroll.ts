import { useRef, useState, useEffect, useCallback } from 'react';

export function useHorizontalScroll(scrollAmount = 400) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(true);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollButtons = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScrollLeft = scrollWidth - clientWidth;

    let isAtStartRight;
    let isAtEndLeft;

    if (scrollLeft > 5) {
      isAtStartRight = Math.abs(scrollLeft - maxScrollLeft) < 10;
      isAtEndLeft = scrollLeft < 10;
    } else {
      isAtStartRight = Math.abs(scrollLeft) < 10;
      isAtEndLeft = Math.abs(scrollLeft) > maxScrollLeft - 10;
    }

    setCanScrollLeft(!isAtEndLeft);
    setCanScrollRight(!isAtStartRight);
  }, []);

  const scroll = useCallback(
    (direction: 'left' | 'right') => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const currentScroll = el.scrollLeft;
      const newScrollLeft = currentScroll + (direction === 'left' ? -scrollAmount : scrollAmount);
      el.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth',
      });
      setTimeout(checkScrollButtons, 500);
    },
    [scrollAmount, checkScrollButtons]
  );

  useEffect(() => {
    const scrollTimer = setTimeout(checkScrollButtons, 200);
    const el = scrollContainerRef.current;

    if (el) {
      el.addEventListener('scroll', checkScrollButtons, { passive: true });
      window.addEventListener('resize', checkScrollButtons);
      return () => {
        clearTimeout(scrollTimer);
        el.removeEventListener('scroll', checkScrollButtons);
        window.removeEventListener('resize', checkScrollButtons);
      };
    }
    return () => clearTimeout(scrollTimer);
  }, [checkScrollButtons]);

  return { scrollContainerRef, canScrollLeft, canScrollRight, scroll };
}
