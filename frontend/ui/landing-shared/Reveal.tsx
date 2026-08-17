'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/frontend/shared/cn';

const VARIANTS: Record<string, string> = {
  up: 'landing-reveal',
  'up-sm': 'landing-reveal landing-reveal-up-sm',
  fade: 'landing-reveal landing-reveal-fade',
  scale: 'landing-reveal landing-reveal-scale',
  left: 'landing-reveal landing-reveal-left',
  right: 'landing-reveal landing-reveal-right',
};

export interface RevealProps {
  as?: 'div' | 'li' | 'article' | 'header' | 'section' | 'ol' | 'p' | 'span';
  className?: string;
  delay?: number;
  variant?: keyof typeof VARIANTS;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Reveal({
  as = 'div',
  className,
  delay = 0,
  variant = 'up',
  children,
  style,
  ...rest
}: RevealProps & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
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
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Tag = as as React.ElementType;

  return (
    <Tag
      ref={ref}
      {...rest}
      className={cn(VARIANTS[variant], isVisible && 'is-visible', className)}
      style={
        delay > 0 ? ({ ...style, ['--ld' as string]: `${delay}s` } as React.CSSProperties) : style
      }
    >
      {children}
    </Tag>
  );
}
