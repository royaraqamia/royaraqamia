'use client';

import { ArrowRight } from 'lucide-react';

import { Button } from '@/frontend/ui/primitives/button';
import { cn } from '@/frontend/shared/cn';
import { useBackAction } from '@/frontend/ui/navbar/use-back';
import { BACK_CONTROL_COPY } from './back-control-copy';

/**
 * Generic, route-agnostic back control — the single back affordance in the app.
 *
 * The decision lives in `useBackAction`: in-app history wins whenever there is
 * any (the user gets back whatever they were looking at a moment ago), a page
 * opened cold goes *up* the URL to the nearest real page instead of dropping
 * the visitor out of the site, and neither path ever pushes — which is what
 * kept two pages trading places under repeated presses.
 *
 * `className` is merged last, so a host surface (the sticky back header) can
 * restyle it without a second implementation of the same decision.
 */
export function BackButton({
  label = BACK_CONTROL_COPY.label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  const goBack = useBackAction();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={goBack}
      className={cn(
        'group size-9 rounded-full border border-border bg-muted text-muted-foreground hover:border-primary/30 hover:bg-primary/20 hover:text-primary transition-safe',
        className
      )}
    >
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Button>
  );
}
