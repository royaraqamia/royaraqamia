'use client';

import { useState, type ReactNode } from 'react';

import { SubscribeForm } from './subscribe-form';

interface SubscribeFlowProps {
  /** The plan's own pitch, server-rendered so the copy stays out of the client bundle. */
  summary: ReactNode;
  /** The account's name, so the form does not ask twice. */
  defaultName: string;
}

/**
 * Holds the "submitted" flag for the subscribe page: once the request lands, the
 * confirmation is what deserves the screen, and the pitch is what they just
 * acted on.
 */
export function SubscribeFlow({ summary, defaultName }: SubscribeFlowProps) {
  const [isSubmitted, setIsSubmitted] = useState(false);

  return (
    <div className="space-y-8">
      {!isSubmitted ? summary : null}

      <SubscribeForm onSubmitted={() => setIsSubmitted(true)} defaultName={defaultName} />
    </div>
  );
}
