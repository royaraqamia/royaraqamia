'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
    danger: 'bg-destructive/10 text-destructive',
    default: 'bg-primary/10 text-primary',
  };

  const confirmColors = {
    danger: 'bg-destructive hover:bg-destructive/90 shadow-destructive/30',
    default: 'bg-primary hover:bg-primary/90 shadow-primary/30',
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000]">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        role="presentation"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="fixed bg-background border border-border shadow-2xl w-full p-6 focus:outline-none
          max-w-sm mx-4 rounded-3xl
          max-h-[85dvh] overflow-y-auto
          max-md:w-[calc(100%-48px)] max-md:mx-auto max-md:max-w-none max-md:rounded-t-3xl max-md:rounded-b-none
          top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          max-md:bottom-6 max-md:top-auto max-md:translate-y-0"
      >
        <button
          onClick={onCancel}
          aria-label="إغلاق"
          className="absolute top-4 left-4 p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-ring touch-target btn-press"
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
              className="flex-1 py-2.5 px-4 text-sm font-semibold text-foreground bg-muted hover:bg-muted/80 rounded-xl transition-colors cursor-pointer focus-ring touch-target btn-press"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              autoFocus
              className={`flex-1 py-2.5 px-4 text-sm font-semibold text-primary-foreground rounded-xl transition-colors shadow-md cursor-pointer focus-ring btn-press touch-target ${confirmColors[variant]}`}
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
