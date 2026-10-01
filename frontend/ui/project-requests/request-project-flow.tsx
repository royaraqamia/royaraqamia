'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { ProjectRequestWizard } from './project-request-wizard';

/**
 * Holds the "submitted" flag for the request-project page so the summary can
 * step aside once the Client has submitted — the confirmation is what deserves
 * the screen, and the pitch is the thing they just acted on.
 *
 * The summary arrives as a prop (rather than being rendered here) so it stays a
 * server-rendered node and keeps sharing its single source with the rest of the
 * site's copy.
 */
export function RequestProjectFlow({ summary }: { summary: ReactNode }) {
  const [isSubmitted, setIsSubmitted] = useState(false);

  return (
    <div className="space-y-8">
      {!isSubmitted && summary}

      {/* The wizard supplies its own card chrome; the confirmation is a
          self-contained panel, so no wrapper frames either of them. */}
      <section aria-label="نموذج طلب المشروع">
        <ProjectRequestWizard onSubmitted={() => setIsSubmitted(true)} />
      </section>
    </div>
  );
}
