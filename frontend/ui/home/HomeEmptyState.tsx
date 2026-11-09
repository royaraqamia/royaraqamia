'use client';

import { Plus } from 'lucide-react';

import { ServicesMenu } from '@/frontend/ui/navbar/ServicesMenu';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';

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
          /* The Hero's main button, so the page's first action is the same
             control the landing page opens with. */
          <HeroCtaButton
            type="button"
            data-visual="home-empty-add"
            className="mt-8 min-w-44 sm:min-w-50"
          >
            <Plus className="size-4" aria-hidden="true" />
            {HOME_COPY.emptyCta}
          </HeroCtaButton>
        }
      />

      <p className="mt-3 text-xs text-neutral-500">{HOME_COPY.emptyNote}</p>
    </section>
  );
}
