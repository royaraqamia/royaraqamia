import type { ReactNode } from 'react';
import { cn } from '@/frontend/shared/cn';

/**
 * Content wrapper with no entrance animation (ADR 0004).
 *
 * Formerly a client reveal island toggling `.is-visible` via an
 * IntersectionObserver. The observer, the hidden initial state and the client
 * boundary are removed: children render immediately, server-side. `delay`,
 * `duration` and `from` are accepted for call-site compatibility and ignored.
 */
type MotionRevealProps = {
  children: ReactNode;
  className?: string;
  /** seconds to wait before animating (default 0) — ignored */
  delay?: number;
  /** animation duration in seconds (default 0.6) — ignored */
  duration?: number;
  /** initial transform, e.g. 'translateY(50px) scale(0.95)' — ignored */
  from?: string;
};

export function MotionReveal({ children, className }: MotionRevealProps) {
  return <div className={cn(className)}>{children}</div>;
}
