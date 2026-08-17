'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/frontend/shared/cn';

interface ScrollAnimationProps {
  children: React.ReactNode;
  className?: string;
  animation?: 'fade-in' | 'slide-up' | 'slide-right' | 'slide-left' | 'scale' | 'slide-down';
  delay?: number;
  duration?: number;
}

const STARTS: Record<NonNullable<ScrollAnimationProps['animation']>, string> = {
  'fade-in': 'none',
  'slide-up': 'translateY(50px)',
  'slide-down': 'translateY(-50px)',
  'slide-right': 'translateX(-50px)',
  'slide-left': 'translateX(50px)',
  scale: 'scale(0.8)',
};

export function ScrollAnimation({
  children,
  className = '',
  animation = 'fade-in',
  delay = 0,
  duration = 0.6,
}: ScrollAnimationProps) {
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
          ['--landing-reveal-from' as string]: STARTS[animation],
          ['--ld' as string]: `${delay}s`,
          ['--landing-reveal-dur' as string]: `${duration}s`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
