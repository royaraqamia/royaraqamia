import { useEffect, useRef, useState } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  root?: Element | null;
  rootMargin?: string;
}

export function useIntersectionObserver<T extends Element>(
  options: UseIntersectionObserverOptions = {}
) {
  const [entries, setEntries] = useState<Map<Element, IntersectionObserverEntry>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementsRef = useRef<Set<Element>>(new Set());

  useEffect(() => {
    // Create the observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setEntries((prev) => {
          const next = new Map(prev);
          entries.forEach((entry) => {
            next.set(entry.target, entry);
          });
          return next;
        });
      },
      {
        threshold: options.threshold ?? 0,
        root: options.root ?? null,
        rootMargin: options.rootMargin ?? '0px',
      }
    );

    // Observe all existing elements
    elementsRef.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    // Cleanup
    return () => {
      observerRef.current?.disconnect();
    };
  }, [options.threshold, options.root, options.rootMargin]);

  const observe = (element: T | null) => {
    if (!element) return;

    elementsRef.current.add(element);
    observerRef.current?.observe(element);
  };

  const unobserve = (element: T | null) => {
    if (!element) return;

    elementsRef.current.delete(element);
    observerRef.current?.unobserve(element);
    setEntries((prev) => {
      const next = new Map(prev);
      next.delete(element);
      return next;
    });
  };

  return { entries, observe, unobserve };
}
