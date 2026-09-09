'use client';

import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/ui/primitives/dialog';

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

export const ConfirmDialog = memo(function ConfirmDialog({
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
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md w-[calc(100%-2rem)] mx-auto p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-border/80 bg-background/95 shadow-2xl z-10002"
        onPointerDownOutside={(e) => {
          e.preventDefault();
          onCancel();
        }}
        onEscapeKeyDown={onCancel}
      >
        <DialogHeader className="flex flex-col items-center text-center space-y-0 pt-1">
          <div
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-300 hover:scale-105 shadow-xs ${
              variant === 'danger'
                ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/25 dark:bg-destructive/20 dark:ring-destructive/30'
                : 'bg-primary/10 text-primary ring-1 ring-primary/25 dark:bg-primary/20 dark:ring-primary/30'
            }`}
          >
            <Icon aria-hidden="true" className="w-6 h-6 sm:w-7 sm:h-7 shrink-0" />
          </div>
          <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed wrap-break-word max-w-prose">
            {message}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row gap-3 w-full">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:flex-1 py-2.5 px-4 text-sm font-bold text-foreground bg-muted hover:bg-muted/80 active:bg-muted/90 border border-border/40 rounded-xl sm:rounded-2xl transition-[background-color,border-color,box-shadow,transform] duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] touch-manipulation shadow-xs"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`w-full sm:flex-1 py-2.5 px-4 text-sm font-bold rounded-xl sm:rounded-2xl transition-[background-color,box-shadow,transform] duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] touch-manipulation ${
              variant === 'danger'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95 shadow-md shadow-destructive/20 hover:shadow-lg hover:shadow-destructive/30 focus-visible:ring-destructive'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 focus-visible:ring-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
