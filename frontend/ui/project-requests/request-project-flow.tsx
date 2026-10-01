'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { LogIn } from 'lucide-react';

import { ProjectRequestWizard } from './project-request-wizard';

interface RequestProjectFlowProps {
  summary: ReactNode;
  /** Whether a session was present on first render. */
  isAuthenticated: boolean;
}

/**
 * Holds the "submitted" flag for the request-project page so the summary can
 * step aside once the Client has submitted — the confirmation is what deserves
 * the screen, and the pitch is the thing they just acted on.
 *
 * The summary arrives as a prop (rather than being rendered here) so it stays a
 * server-rendered node and keeps sharing its single source with the rest of the
 * site's copy.
 */
export function RequestProjectFlow({ summary, isAuthenticated }: RequestProjectFlowProps) {
  const [isSubmitted, setIsSubmitted] = useState(false);

  return (
    <div className="space-y-8">
      {!isSubmitted && summary}

      {/* Signing in is optional — an anonymous submission still works. The
          notice only sets the expectation that editing later needs an account. */}
      {!isSubmitted && !isAuthenticated && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <LogIn className="size-4 shrink-0" aria-hidden="true" />
          <span>
            سجِّل الدُّخول قبل الإرسال إن أردت تعديل طلبك لاحقًا من صفحة
            <a
              href="/account/submissions"
              className="mx-1 font-bold text-primary hover:underline underline-offset-4"
            >
              طلباتي
            </a>
            .
          </span>
          <a
            href="/auth/login?redirect=/request-project"
            className="font-bold text-primary hover:underline underline-offset-4"
          >
            تسجيل الدُّخول
          </a>
        </div>
      )}

      {/* The wizard supplies its own card chrome; the confirmation is a
          self-contained panel, so no wrapper frames either of them. */}
      <section aria-label="نموذج طلب المشروع">
        <ProjectRequestWizard
          onSubmitted={() => setIsSubmitted(true)}
          isAuthenticated={isAuthenticated}
        />
      </section>
    </div>
  );
}
