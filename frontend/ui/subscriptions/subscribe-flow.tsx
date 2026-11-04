'use client';

import { useState, type ReactNode } from 'react';

import { SubscribeWizard } from './subscribe-wizard';

interface SubscribeFlowProps {
  /** The plan's own pitch, server-rendered so the copy stays out of the client bundle. */
  summary: ReactNode;
  /** The account's name and email, so the form does not ask twice. */
  defaultName: string;
  defaultEmail: string;
}

/**
 * Holds the "submitted" flag for the subscribe page: once the request lands, the
 * confirmation is what deserves the screen, and the pitch is what they just
 * acted on.
 */
export function SubscribeFlow({ summary, defaultName, defaultEmail }: SubscribeFlowProps) {
  const [isSubmitted, setIsSubmitted] = useState(false);

  return (
    <div className="space-y-8">
      {!isSubmitted ? summary : null}

      <section aria-label="نموذج الاشتراك">
        <SubscribeWizard
          onSubmitted={() => setIsSubmitted(true)}
          defaultName={defaultName}
          defaultEmail={defaultEmail}
        />
      </section>
    </div>
  );
}
