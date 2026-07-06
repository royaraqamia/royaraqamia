import { useState, useEffect } from 'react';
import { useUI } from '../context/UIContext';

export function GoUpButton() {
  const { isMobileMenuOpen, isReviewSheetOpen } = useUI();
  const [isVisible, setIsVisible] = useState(false);

  // Determine if button should be hidden due to overlay UI
  const shouldHide = isMobileMenuOpen || isReviewSheetOpen;

  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300);
    };

    const throttledToggle = throttle(toggleVisibility, 100);
    window.addEventListener('scroll', throttledToggle, { passive: true });

    return () => window.removeEventListener('scroll', throttledToggle);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // If hidden or not yet visible, render nothing
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

// Throttle utility for performance
function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecTime = 0;

  return (...args: Parameters<T>) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(
        () => {
          func(...args);
          lastExecTime = Date.now();
        },
        delay - (currentTime - lastExecTime)
      );
    }
  };
}
