'use client';

import { Plus } from 'lucide-react';

import { ServicesMenu } from '@/frontend/ui/navbar/ServicesMenu';

import { HOME_COPY } from './home-copy';

/**
 * The first-run homepage (ADR-0146): no tab strip, one action.
 *
 * The Add control opens the same sheet the navbar does, so the first app is
 * added by the same list that adds the eleventh — there is no separate
 * onboarding flow to keep in step.
 */
export function HomeEmptyState() {
  return (
    <section
      aria-labelledby="home-empty-title"
      data-visual="home-empty"
      className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-xl flex-col items-center justify-center px-6 py-16 text-center"
    >
      <h1 id="home-empty-title" className="text-3xl font-bold text-foreground sm:text-4xl">
        {HOME_COPY.emptyTitle}
      </h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-neutral-400">
        {HOME_COPY.emptyBody}
      </p>

      <ServicesMenu
        trigger={
          <button
            type="button"
            data-visual="home-empty-add"
            className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-violet-600 px-7 text-sm font-bold text-white transition-safe duration-200 ease-out hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:scale-95"
          >
            <Plus className="size-4" aria-hidden="true" />
            {HOME_COPY.emptyCta}
          </button>
        }
      />

      <p className="mt-3 text-xs text-neutral-500">{HOME_COPY.emptyNote}</p>
    </section>
  );
}
