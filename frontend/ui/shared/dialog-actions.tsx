'use client';

import type { ReactNode } from 'react';
import { Button } from '@/frontend/ui/primitives/button';
import { cn } from '@/frontend/shared/cn';

interface DialogActionsProps {
  /** The primary action button (usually a `HeroCtaButton`). Add `w-full sm:w-auto` to it. */
  children: ReactNode;
  onCancel: () => void;
  cancelLabel?: string;
  /** Drop the text cancel: the dialog's only action is the primary one (a note that saves itself). */
  hideCancel?: boolean;
  /** Optional start-side action rendered opposite the primary/cancel group (e.g. an archive button). */
  leading?: ReactNode;
  /** Optional secondary action rendered between the primary and the cancel (e.g. a destructive button). */
  secondary?: ReactNode;
  className?: string;
  /** An optional `data-visual` anchor for the visual gate's contract. */
  dataVisual?: string;
}

/**
 * Unified dialog/bottom-sheet footer.
 *
 * Mobile: full-width primary button, with the secondary text-only cancel below it.
 * Tablet/desktop: a right-to-left row of primary + text cancel, aligned to the end.
 *
 * On a phone the footer is the first thing the on-screen keyboard takes: while it
 * is up `app/global.css` hides every `[data-slot='dialog-actions']`, so the field
 * the writer is in owns the screen and the buttons come back with the keyboard's
 * dismissal (ADR-0109).
 */
export function DialogActions({
  children,
  onCancel,
  cancelLabel = 'إلغاء',
  hideCancel = false,
  leading,
  secondary,
  className,
  dataVisual,
}: DialogActionsProps) {
  return (
    <div
      data-slot="dialog-actions"
      data-visual={dataVisual}
      className={cn(
        'pt-2 flex flex-col-reverse sm:flex-row items-center gap-3',
        leading ? 'sm:justify-between' : 'max-sm:justify-end sm:justify-end',
        className
      )}
    >
      {leading}
      <div className="flex flex-col-reverse sm:flex-row items-center gap-3 max-sm:w-full sm:w-auto">
        {!hideCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="max-sm:w-full sm:w-auto rounded-xl px-5 max-sm:h-13 sm:h-14 text-[14px] font-medium border-transparent bg-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-safe duration-300"
          >
            {cancelLabel}
          </Button>
        )}
        {secondary}
        {children}
      </div>
    </div>
  );
}
