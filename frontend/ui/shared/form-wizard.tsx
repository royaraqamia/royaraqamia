'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';

export interface WizardStepMeta {
  /** Stable key for React; step bodies are switched by the caller. */
  key: string;
  /** Rendered next to the step's number on all but the narrowest screens. */
  label: string;
}

interface FormWizardProps {
  steps: readonly WizardStepMeta[];
  currentIndex: number;
  ariaLabel: string;
  error?: string | null;
  submitting?: boolean;
  /** Whether the active step holds enough to advance. */
  canProceed: boolean;
  confirmLabel: string;
  submittingLabel: string;
  onBack: () => void;
  onNext: () => void;
  onConfirm: () => void;
  /** The active step's body. */
  children: ReactNode;
}

/**
 * The shared stepper + navigation shell behind every multi-step form
 * (consultation booking, project requests, retainers). It owns only the
 * chrome — which step is active, and the Back/Next/Confirm buttons — so each
 * flow keeps its own step definitions and gating rules.
 */
export function FormWizard({
  steps,
  currentIndex,
  ariaLabel,
  error,
  submitting = false,
  canProceed,
  confirmLabel,
  submittingLabel,
  onBack,
  onNext,
  onConfirm,
  children,
}: FormWizardProps) {
  const isLastStep = currentIndex === steps.length - 1;

  return (
    <div className="rounded-3xl border border-border bg-card/60 p-5 sm:p-8">
      {/* Stepper */}
      <ol className="flex items-center gap-2 mb-8" aria-label={ariaLabel}>
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-2 flex-1 last:flex-none">
            <span
              aria-current={index === currentIndex ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 text-xs sm:text-sm font-bold whitespace-nowrap',
                index === currentIndex
                  ? 'text-primary'
                  : index < currentIndex
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground/60'
              )}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border-2 text-[11px] font-bold',
                  index === currentIndex
                    ? 'border-primary bg-primary/15 text-primary'
                    : index < currentIndex
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'border-border text-muted-foreground/60'
                )}
              >
                {index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </span>
            {index < steps.length - 1 && (
              <span
                className={cn(
                  'h-0.5 flex-1 rounded-full',
                  index < currentIndex ? 'bg-emerald-500' : 'bg-border'
                )}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>

      {children}

      {error && (
        <p
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Navigation */}
      <nav data-flat-nav className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={currentIndex === 0 || submitting}
          className="inline-flex items-center justify-end gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          السَّابق
        </button>

        {isLastStep ? (
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canProceed || submitting}
            className="inline-flex items-center justify-start gap-2 rounded-full px-8 py-2.5 text-sm font-bold text-primary-foreground bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 shadow-lg transition-safe duration-300 active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {submittingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={!canProceed}
            className="inline-flex items-center justify-start gap-2 rounded-full px-8 py-2.5 text-sm font-bold text-primary-foreground bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 shadow-lg transition-safe duration-300 active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            التَّالي
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        )}
      </nav>
    </div>
  );
}
