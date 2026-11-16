'use client';

import { cn } from '@/frontend/shared/cn';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';

/**
 * The two loading shapes the surfaces share.
 *
 * A skeleton is a promise about what is coming: the list's rows, the thread's
 * bubbles and composer. Both are drawn from the page's own tokens rather than the
 * primitive's neutral defaults, so a skeleton on a card is a block on the card and
 * not a grey rectangle from another design system.
 *
 * One region announces itself (`role="status"`, the surface's own loading
 * sentence); every block inside it is decorative, so a screen reader hears the
 * sentence once instead of once per block.
 */
const BLOCK =
  'bg-muted/60 dark:bg-muted/60 border-border/40 dark:border-border/40 before:via-foreground/10 dark:before:via-foreground/10';

/** A varied run of line widths, so the list reads as rows and not as a table. */
const LINE_WIDTHS = ['w-3/5', 'w-1/2', 'w-2/3', 'w-1/2', 'w-3/5'];

interface LoadingListProps extends React.ComponentProps<'div'> {
  /** The surface's loading sentence, announced once for the whole list. */
  label: string;
  /** How many rows to promise. */
  rows?: number;
  /** The leading circle a member, an icon or an avatar would sit in. */
  showAvatar?: boolean;
  /** The trailing timestamp a list row usually carries. */
  showTrailing?: boolean;
  /** `false` drops the card frame, for a list already inside one. */
  framed?: boolean;
}

/** A card of list rows: notifications, chats, blocks, bookings, slots, packages. */
export function LoadingList({
  label,
  rows = 4,
  showAvatar = true,
  showTrailing = true,
  framed = true,
  className,
  ...props
}: LoadingListProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(
        framed && 'overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-xs',
        className
      )}
      {...props}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={cn(
            'flex items-center gap-3 px-4 py-4',
            framed && index > 0 && 'border-t border-border/40'
          )}
        >
          {showAvatar ? (
            <Skeleton decorative rounded="full" className={cn('size-9 shrink-0', BLOCK)} />
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton
              decorative
              rounded="md"
              className={cn('h-3.5', index % 2 === 0 ? 'w-2/5' : 'w-1/3', BLOCK)}
            />
            <Skeleton
              decorative
              rounded="md"
              className={cn('h-3', LINE_WIDTHS[index % LINE_WIDTHS.length], BLOCK)}
            />
          </div>
          {showTrailing ? (
            <Skeleton decorative rounded="full" className={cn('h-3 w-10 shrink-0', BLOCK)} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

interface LoadingThreadProps extends React.ComponentProps<'div'> {
  /** The thread's loading sentence, announced once for the whole surface. */
  label: string;
  /** `false` drops the card frame, for a panel or a full-height route. */
  framed?: boolean;
}

/** A conversation before it arrives: header, four bubbles and the composer. */
export function LoadingThread({ label, framed = true, className, ...props }: LoadingThreadProps) {
  const bubbles = ['w-3/5', 'w-2/5', 'w-1/2', 'w-3/4'];

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        framed && 'rounded-2xl border border-border/70 bg-card/60 shadow-xs',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3.5">
        <Skeleton decorative rounded="full" className={cn('size-9 shrink-0', BLOCK)} />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton decorative rounded="md" className={cn('h-3.5 w-32 max-w-full', BLOCK)} />
          <Skeleton decorative rounded="md" className={cn('h-2.5 w-20', BLOCK)} />
        </div>
      </div>

      <div className="flex-1 space-y-3 px-4 py-5">
        {bubbles.map((width, index) => (
          <div
            key={index}
            className={cn('flex', index % 2 === 0 ? 'justify-start' : 'justify-end')}
          >
            <Skeleton decorative rounded="2xl" className={cn('h-11', width, BLOCK)} />
          </div>
        ))}
      </div>

      <div className="border-t border-border/40 p-3">
        <Skeleton decorative rounded="full" className={cn('h-11 w-full', BLOCK)} />
      </div>
    </div>
  );
}
