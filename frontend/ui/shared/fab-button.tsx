'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/frontend/shared/cn';

/**
 * Floating action button sharing the exact look of the community "new post" FAB
 * (`compose-fab-btn` in global.css). Used by product dashboards to expose their
 * primary create action without cluttering the toolbar.
 */
export function FabButton({
  label,
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<'button'> & { label: string }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn('compose-fab-btn visible group', className)}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * A FAB that owns the disclosure contract for the panel it opens (#1832): the
 * open state behind `aria-expanded`, `aria-controls` naming the panel, initial
 * focus inside it, Escape to close and focus back on the launcher. It is the
 * trigger contract NavDropdown wears, held in one place so the next dashboard
 * that adds a FAB gets it by construction instead of by review.
 *
 * The launcher is emitted before the panel. It is `position: fixed`, so the
 * order costs nothing on screen, and one Tab from the launcher reaches the
 * revealed panel instead of walking off the end of the document.
 */
export function FabDisclosure({
  label,
  panelId,
  initialFocus,
  panel,
  className,
  children,
}: {
  label: string;
  /** The id of the revealed region; `aria-controls` points at it. */
  panelId: string;
  /** Selector, inside the panel, of the control that takes focus on open. */
  initialFocus: string;
  /** The revealed content; the argument is its own close action. */
  panel: (close: () => void) => ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>(initialFocus)?.focus();
  }, [open, initialFocus]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      close();
    }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open, close]);

  return (
    <>
      <FabButton
        ref={launcherRef}
        label={label}
        className={className}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {children}
      </FabButton>
      <div id={panelId} ref={panelRef} hidden={!open}>
        {open ? panel(close) : null}
      </div>
    </>
  );
}
