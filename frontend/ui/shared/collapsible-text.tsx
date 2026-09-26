'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';

const CLAMP_CLASSES = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
} as const;

export type CollapsibleTextLines = keyof typeof CLAMP_CLASSES;

interface CollapsibleTextProps {
  /** May contain `\n`; newlines are preserved (rendered as line breaks). */
  children: string;
  /** Lines shown while collapsed. */
  lines?: CollapsibleTextLines;
  className?: string;
  /** Color and emphasis for the toggle, tuned per surface it sits on. */
  buttonClassName?: string;
  expandLabel?: string;
  collapseLabel?: string;
}

/**
 * Long copy clamped to a few lines with an expand/collapse toggle.
 *
 * The toggle is measured into existence rather than always rendered: the
 * paragraph is compared against its own clamped height, so copy that already
 * fits (wide viewports, short text) shows no dead button. Measurement is frozen
 * while expanded, because an expanded paragraph never overflows and a fresh
 * reading would hide the toggle and strand the reader with no way back.
 */
export function CollapsibleText({
  children,
  lines = 2,
  className,
  buttonClassName,
  expandLabel = 'عرض المزيد',
  collapseLabel = 'عرض أقل',
}: CollapsibleTextProps) {
  const contentId = useId();
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || isExpanded) return;

    const measure = () => setCanExpand(el.scrollHeight - el.clientHeight > 1);
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, isExpanded, lines]);

  return (
    <div>
      <p
        id={contentId}
        ref={contentRef}
        className={cn('whitespace-pre-line', !isExpanded && CLAMP_CLASSES[lines], className)}
      >
        {children}
      </p>

      {canExpand && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-controls={contentId}
          className={cn(
            'mt-2 inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs font-bold transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:text-sm',
            buttonClassName
          )}
        >
          <span>{isExpanded ? collapseLabel : expandLabel}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-300',
              isExpanded && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
