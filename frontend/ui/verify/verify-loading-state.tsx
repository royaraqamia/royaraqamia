'use client';

import { m } from 'motion/react';

import { Skeleton } from '@/frontend/ui/primitives/skeleton';

/**
 * The page's busy state, in the page's words (`app/verify/page.tsx`, ADR-0098):
 * the two sentences are props because the app draws the same pair from the same
 * copy source.
 *
 * The medallion and the progress bar are the card's own blocks rather than a
 * spinner: the sentences are the page's promise, and a skeleton says the result
 * is coming without a second animation competing with them.
 */
export function VerifyLoadingState({ title, body }: { title: string; body: string }) {
  return (
    <m.div
      key="loading"
      role="status"
      aria-busy="true"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      className="my-6 rounded-3xl border border-primary/20 bg-card/60 p-8 sm:p-12 text-center shadow-xl shadow-primary/5"
    >
      <div className="relative mx-auto flex size-20 items-center justify-center">
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 shadow-inner">
          <Skeleton
            decorative
            rounded="full"
            className="size-8 border-primary/20 bg-primary/20 dark:bg-primary/20"
          />
        </div>
      </div>
      <div className="mt-6 space-y-2">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">{body}</p>
      </div>
      <div className="mt-6 flex justify-center">
        <Skeleton
          decorative
          rounded="full"
          className="h-2 w-24 border-primary/15 bg-primary/15 dark:bg-primary/15"
        />
      </div>
    </m.div>
  );
}
