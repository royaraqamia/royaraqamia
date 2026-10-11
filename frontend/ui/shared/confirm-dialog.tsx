'use client';

import { AlertTriangle, Loader2, type LucideIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/ui/primitives/dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: LucideIcon;
  variant?: 'danger' | 'default';
  /** Locks the primary action and shows a spinner while the confirm runs. */
  isConfirming?: boolean;
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
  isConfirming = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md w-[calc(100%-2rem)] mx-auto p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-border/80 bg-background shadow-2xl"
        onPointerDownOutside={(e) => {
          e.preventDefault();
          onCancel();
        }}
        onEscapeKeyDown={onCancel}
      >
        <DialogHeader className="flex flex-col items-center text-center space-y-0 pt-1 pe-0">
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

        <DialogActions onCancel={onCancel} cancelLabel={cancelLabel} className="mt-6 sm:mt-8 pt-0">
          <HeroCtaButton
            type="button"
            onClick={onConfirm}
            autoFocus
            disabled={isConfirming}
            variant={variant === 'danger' ? 'hero-destructive' : 'hero'}
            className="w-full sm:w-auto"
          >
            {isConfirming ? (
              <>
                <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
                <span>{confirmLabel}</span>
              </>
            ) : (
              confirmLabel
            )}
          </HeroCtaButton>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
});
