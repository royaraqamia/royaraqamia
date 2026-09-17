'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/frontend/shared/cn';
import { TrainingApplicationForm } from './training-application-form';

/**
 * Holds the "applied" flag for the apply page so the course summary can step
 * aside once the student has submitted — the confirmation is what deserves the
 * screen, and the pitch is the thing they just acted on.
 *
 * The summary arrives as a prop (rather than being rendered here) so it stays a
 * server-rendered node and keeps sharing its single source with the homepage
 * card.
 */
export function TrainingApplyFlow({ summary }: { summary: ReactNode }) {
  const [isSubmitted, setIsSubmitted] = useState(false);

  return (
    <div className="space-y-8">
      {!isSubmitted && summary}

      {/* The confirmation is a self-contained panel, so the wrapper drops its
          card chrome for it instead of framing a panel inside a panel. */}
      <section
        aria-label="نموذج التقديم"
        className={cn(
          !isSubmitted && 'rounded-3xl border border-border/60 bg-card p-6 sm:p-8 shadow-sm'
        )}
      >
        <TrainingApplicationForm onSubmitted={() => setIsSubmitted(true)} />
      </section>
    </div>
  );
}
