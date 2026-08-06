'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/frontend/ui/primitives/button';
import { IS_DEVELOPMENT, IS_PRODUCTION } from '@/frontend/shared/constants';
import { logger } from '@/frontend/shared/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (IS_PRODUCTION) {
      Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    } else {
      logger.error('[ErrorBoundary]', {
        error: error.message,
        componentStack: errorInfo.componentStack ?? undefined,
      });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <section
          role="alert"
          aria-live="assertive"
          className="relative flex min-h-120 w-full items-center justify-center px-4 py-12 sm:px-6 lg:px-8"
        >
          {/* Subtle Ambient Red Glow Background Accent */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          >
            <div className="h-72 w-72 rounded-full bg-destructive/10 blur-3xl sm:h-96 sm:w-96" />
          </div>

          {/* Main Error Glassmorphism Card Container */}
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border/60 bg-background/80 p-6 text-center shadow-2xl backdrop-blur-xl transition-all duration-300 sm:p-8">
            {/* Pulsing Icon Badge */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-8 ring-destructive/5 sm:h-20 sm:w-20">
              <svg
                className="h-8 w-8 stroke-[1.75] transition-transform duration-300 hover:scale-110 sm:h-10 sm:w-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>

            {/* Typography Stack */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                حدث خطأ غير مُتوقَّع
              </h2>
              <p className="mx-auto max-w-xs text-sm font-normal leading-relaxed text-muted-foreground sm:text-base">
                عذرًا، حدث خطأ أثناء تحميل الصَّفحة. يُرجَى المحاولة مرَّة أخرى.
              </p>
            </div>

            {/* Primary Action Button */}
            <div className="mt-6 sm:mt-8">
              <Button
                onClick={this.handleReset}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <svg
                  className="h-4 w-4 stroke-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                <span>إعادة المحاولة</span>
              </Button>
            </div>

            {/* Developer Diagnostics Collapsible Section (Development Only) */}
            {IS_DEVELOPMENT && this.state.error && (
              <details className="group mt-6 border-t border-border/40 pt-4 text-left">
                <summary className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span>تفاصيل الخطأ (للتَّطوير فقط)</span>
                  <svg
                    className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </summary>
                <div className="mt-2.5 overflow-hidden rounded-xl border border-border/60 bg-neutral-950 p-3.5 text-xs shadow-inner">
                  <pre
                    dir="ltr"
                    className="max-h-52 overflow-x-auto overflow-y-auto text-left font-mono text-[11px] leading-relaxed text-rose-300 selection:bg-rose-500/30"
                  >
                    {this.state.error.toString()}
                    {'\n'}
                    {this.state.error.stack}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
