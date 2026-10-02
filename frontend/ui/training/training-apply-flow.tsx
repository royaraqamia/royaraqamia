'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { LogIn } from 'lucide-react';

import { TrainingApplicationWizard } from './training-application-wizard';

interface TrainingApplyFlowProps {
  summary: ReactNode;
  /** Whether a session was present on first render. */
  isAuthenticated: boolean;
}

/**
 * Holds the "applied" flag for the apply page so the course summary can step
 * aside once the student has submitted — the confirmation is what deserves the
 * screen, and the pitch is the thing they just acted on.
 *
 * The summary arrives as a prop (rather than being rendered here) so it stays a
 * server-rendered node and keeps sharing its single source with the homepage
 * card.
 */
export function TrainingApplyFlow({ summary, isAuthenticated }: TrainingApplyFlowProps) {
  const [isSubmitted, setIsSubmitted] = useState(false);

  return (
    <div className="space-y-8">
      {!isSubmitted && summary}

      {/* Signing in is optional — an anonymous application still works. The
          notice only sets the expectation that editing later needs an account. */}
      {!isSubmitted && !isAuthenticated && (
        <div className="flex items-start gap-2 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <LogIn className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            سجِّل الدُّخول قبل الإرسال إن أردتَّ تعديل طلبك لاحقًا.{' '}
            <a
              href="/auth/login?redirect=/training/apply"
              className="font-bold text-primary hover:underline underline-offset-4"
            >
              تسجيل الدُّخول
            </a>
          </p>
        </div>
      )}

      {/* The wizard supplies its own card chrome; the confirmation is a
          self-contained panel, so no wrapper frames either of them. */}
      <section aria-label="نموذج التقديم">
        <TrainingApplicationWizard
          onSubmitted={() => setIsSubmitted(true)}
          isAuthenticated={isAuthenticated}
        />
      </section>
    </div>
  );
}
