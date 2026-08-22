'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, type LucideIcon } from 'lucide-react';
import { useFocusTrap } from '@/frontend/shared/use-focus-trap';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: LucideIcon;
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  icon: Icon = AlertTriangle,
  variant = 'danger',
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef, onCancel);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const iconColors = {
    danger:
      'bg-destructive/10 text-destructive ring-1 ring-destructive/25 dark:bg-destructive/20 dark:ring-destructive/30',
    default:
      'bg-primary/10 text-primary ring-1 ring-primary/25 dark:bg-primary/20 dark:ring-primary/30',
  };

  const confirmColors = {
    danger:
      'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95 shadow-md shadow-destructive/20 hover:shadow-lg hover:shadow-destructive/30 focus-visible:ring-destructive',
    default:
      'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 focus-visible:ring-primary',
  };

  return createPortal(
    <div className="fixed inset-0 z-10002 flex items-center justify-center p-4 sm:p-6 overflow-y-auto min-h-screen">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-neutral-950/60 transition-opacity duration-300 animate-in fade-in"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        role="presentation"
      />

      {/* Dialog container */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="relative w-full max-w-sm sm:max-w-md rounded-2xl sm:rounded-3xl bg-background/95 border border-border/80 shadow-2xl shadow-black/10 dark:shadow-black/50 p-6 sm:p-8 animate-in fade-in zoom-in-95 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-h-[85dvh] overflow-y-auto dialog-scrollbar my-auto"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="إغلاق"
          className="absolute top-4 left-4 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-full transition-[background-color,color,transform] duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 touch-manipulation"
        >
          <X aria-hidden="true" className="w-4 h-4" />
        </button>

        {/* Content wrapper */}
        <div className="flex flex-col items-center text-center pt-1">
          {/* Icon Badge */}
          <div
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-300 hover:scale-105 shadow-xs ${iconColors[variant]}`}
          >
            <Icon aria-hidden="true" className="w-6 h-6 sm:w-7 sm:h-7 shrink-0" />
          </div>

          {/* Title & Message */}
          <h3
            id="confirm-dialog-title"
            className="text-lg sm:text-xl font-bold tracking-tight text-foreground"
          >
            {title}
          </h3>
          <p
            id="confirm-dialog-message"
            className="mt-2 text-sm text-muted-foreground leading-relaxed wrap-break-word max-w-prose"
          >
            {message}
          </p>

          {/* Action Buttons */}
          <div className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row gap-3 w-full">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:flex-1 py-2.5 px-4 text-sm font-semibold text-foreground bg-muted hover:bg-muted/80 active:bg-muted/90 border border-border/40 rounded-xl sm:rounded-2xl transition-[background-color,border-color,box-shadow,transform] duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] touch-manipulation shadow-xs"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              autoFocus
              className={`w-full sm:flex-1 py-2.5 px-4 text-sm font-semibold rounded-xl sm:rounded-2xl transition-[background-color,box-shadow,transform] duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] touch-manipulation ${confirmColors[variant]}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
