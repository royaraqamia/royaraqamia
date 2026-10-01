'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { TrainingApplicationWizard } from './training-application-wizard';

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

      {/* The wizard supplies its own card chrome; the confirmation is a
          self-contained panel, so no wrapper frames either of them. */}
      <section aria-label="نموذج التقديم">
        <TrainingApplicationWizard onSubmitted={() => setIsSubmitted(true)} />
      </section>
    </div>
  );
}
