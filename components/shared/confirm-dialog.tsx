'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, X, type LucideIcon } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

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
    danger: 'bg-red-50 dark:bg-red-900/20 text-red-500',
    default: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500',
  };

  const confirmColors = {
    danger:
      'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 shadow-red-200 dark:shadow-red-900/30',
    default: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        role="button"
        tabIndex={-1}
        aria-label="إغلاق"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="relative bg-background rounded-2xl border border-border shadow-2xl w-full max-w-sm mx-4 p-6 focus:outline-none"
      >
        <button
          onClick={onCancel}
          aria-label="إغلاق"
          className="absolute top-4 left-4 p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-ring"
        >
          <X aria-hidden="true" className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center pt-2">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${iconColors[variant]}`}
          >
            <Icon aria-hidden="true" className="w-5 h-5" />
          </div>
          <h3 id="confirm-dialog-title" className="text-lg font-bold text-foreground mb-2">
            {title}
          </h3>
          <p
            id="confirm-dialog-message"
            className="text-sm text-muted-foreground mb-6 leading-relaxed"
          >
            {message}
          </p>
          <div className="flex gap-3 w-full">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 px-4 text-sm font-semibold text-foreground bg-muted hover:bg-muted/80 rounded-xl transition-colors cursor-pointer focus-ring"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold text-white rounded-xl transition-colors shadow-md cursor-pointer focus-ring ${confirmColors[variant]}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
