import { cn } from '@/frontend/shared/cn';

export interface RevealProps {
  as?: 'div' | 'li' | 'article' | 'header' | 'section' | 'ol' | 'p' | 'span';
  className?: string;
  delay?: number;
  variant?: 'up' | 'up-sm' | 'fade' | 'scale' | 'left' | 'right';
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Content wrapper with no entrance animation (ADR 0004).
 *
 * This used to be a client island that kept its children at `opacity: 0` until
 * an IntersectionObserver added `.is-visible`. That made above-the-fold content
 * depend on hydration to become visible and pinned a compositor layer per
 * wrapper. Both are gone: the props are kept for call-site compatibility, but
 * the markup renders immediately and server-side.
 */
export function Reveal({
  as = 'div',
  className,
  children,
  style,
  ...rest
}: RevealProps & React.HTMLAttributes<HTMLElement>) {
  const Tag = as as React.ElementType;
  return (
    <Tag {...rest} className={cn(className)} style={style}>
      {children}
    </Tag>
  );
}
