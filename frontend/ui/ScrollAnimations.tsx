import { cn } from '@/frontend/shared/cn';

interface ScrollAnimationProps {
  children: React.ReactNode;
  className?: string;
  animation?: 'fade-in' | 'slide-up' | 'slide-right' | 'slide-left' | 'scale' | 'slide-down';
  delay?: number;
  duration?: number;
}

/**
 * Content wrapper with no scroll-triggered entrance (ADR 0004).
 *
 * This was a client island that revealed its children via an
 * IntersectionObserver. That made content depend on hydration to appear and
 * pinned a layer per instance, so the observer is removed and children render
 * immediately. `animation`, `delay` and `duration` are kept for call-site
 * compatibility and ignored.
 */
export function ScrollAnimation({ children, className = '' }: ScrollAnimationProps) {
  return <div className={cn(className)}>{children}</div>;
}
