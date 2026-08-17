'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/frontend/shared/cn';

/**
 * Minimal client reveal island (no framer-motion).
 *
 * Server Components render the surrounding static markup and pass it as
 * `children`; only this thin wrapper stays in the client bundle. An
 * IntersectionObserver toggles `.is-visible` and the CSS animations in
 * `app/global.css` (`.landing-reveal` / `.landing-reveal-item`) handle the
 * rest.
 */
type MotionRevealProps = {
  children: ReactNode;
  className?: string;
  /** seconds to wait before animating (default 0) */
  delay?: number;
  /** animation duration in seconds (default 0.6) */
  duration?: number;
  /** initial transform, e.g. 'translateY(50px) scale(0.95)' (default 'translateY(24px)') */
  from?: string;
};

export function MotionReveal({
  children,
  className,
  delay = 0,
  duration = 0.6,
  from,
}: MotionRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -100px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn('landing-reveal', isVisible && 'is-visible', className)}
      style={
        {
          ['--landing-reveal-from' as string]: from,
          ['--ld' as string]: `${delay}s`,
          ['--landing-reveal-dur' as string]: `${duration}s`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
