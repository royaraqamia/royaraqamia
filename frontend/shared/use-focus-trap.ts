import { useEffect, RefObject } from 'react';

export function useFocusTrap<T extends HTMLElement>(
  isActive: boolean,
  containerRef: RefObject<T | null>,
  onEscape?: () => void
) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape?.();
      }
    };

    container.addEventListener('keydown', handleTabKey);
    container.addEventListener('keydown', handleEscapeKey);

    return () => {
      container.removeEventListener('keydown', handleTabKey);
      container.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isActive, containerRef, onEscape]);
}
