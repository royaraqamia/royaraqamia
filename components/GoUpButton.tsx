'use client';

import { useState, useEffect } from 'react';
import { useUI } from '../context/UIContext';
import { throttle } from '../lib/utils';
import { scrollToTop } from '../lib/scroll';

export function GoUpButton() {
  const { isMobileMenuOpen, isReviewSheetOpen } = useUI();
  const [isVisible, setIsVisible] = useState(false);

  const shouldHide = isMobileMenuOpen || isReviewSheetOpen;

  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300);
    };

    const throttledToggle = throttle(toggleVisibility, 100);
    window.addEventListener('scroll', throttledToggle, { passive: true });

    return () => window.removeEventListener('scroll', throttledToggle);
  }, []);

  if (shouldHide || !isVisible) {
    return null;
  }

  return (
    <button
      onClick={scrollToTop}
      aria-label="العودة إلى أعلى الصفحة"
      className="go-up-btn visible"
      type="button"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M7 14L12 9L17 14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
