import { Eye } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';

interface PostViewsProps {
  /** The post's own tally, as the read carries it. */
  count: number;
  className?: string;
}

/**
 * «25 👁» — how many times a post has been opened.
 *
 * A fact about the post, not an action on it, so it lives on the meta line with
 * the time rather than in a row of buttons where a dead cell would have to sit:
 * the bar holds only what can be pressed (ADR-0201's card decision).
 *
 * Zero renders nothing. A post nobody has opened yet is not a post nobody wants,
 * and a row of zeroes is what makes a young feed look abandoned.
 */
export function PostViews({ count, className }: PostViewsProps) {
  if (count <= 0) return null;

  const label = count.toLocaleString('en-US');

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title="عدد المشاهدات"
      aria-label={`${label} مشاهدة`}
    >
      <Eye className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="font-digits" dir="ltr" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
