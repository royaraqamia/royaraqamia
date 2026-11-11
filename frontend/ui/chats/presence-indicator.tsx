'use client';

import { cn } from '@/frontend/shared/cn';

/** The three dots the copy ends a live sentence with, and nothing else. */
const TRAILING_DOTS = /\.\.\.$/;

/**
 * «يكتب الآن...» or «يُسجِّل رسالة صوتيَّة...» with the dots kept alive.
 *
 * The copy owns the sentence, including its three dots, so the component splits
 * them off and animates only the dots: a screen reader hears one sentence, and
 * a reader who asked for reduced motion sees exactly the same words standing
 * still. The colour is the site's primary — the live line is the one thing in
 * the header and the row that is happening now.
 */
export function PresenceIndicator({ label, className }: { label: string; className?: string }) {
  const text = label.replace(TRAILING_DOTS, '');
  const animated = text !== label;

  return (
    <span
      aria-live="polite"
      className={cn('flex min-w-0 items-baseline gap-0.5 text-primary', className)}
    >
      <span className="min-w-0 truncate">{text}</span>
      {animated && (
        <span aria-hidden="true" className="inline-flex shrink-0 items-baseline">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="animate-pulse motion-reduce:animate-none"
              style={{ animationDelay: `${index * 160}ms` }}
            >
              .
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
