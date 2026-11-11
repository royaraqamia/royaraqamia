'use client';

import { Lock } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';

interface SignInPromptDialogProps {
  open: boolean;
  /** The overlay is closing for any reason but the sign-in link below. */
  onDismiss: () => void;
  /**
   * The overlay only needs to come off the screen because the caller is about to
   * navigate (the sign-in link's own dismissal). Defaults to `onDismiss`, which
   * is right on a page the visitor stays on.
   */
  onClose?: () => void;
  /** The page a signed-in visitor lands on, once the sign-in page answers. */
  redirectTo: string;
  title: string;
  signInLabel: string;
  cancelLabel: string;
}

/**
 * The guest gate the account rows and the direct chat screen share: one question,
 * the sign-in pill and the quiet way out.
 *
 * The words arrive as props rather than living here because they are the site's
 * copy, generated for both clients from `shared/copy/account-rows.json`
 * (ADR-0098). Dismissing hands the caller its own way back: the account page
 * closes the dialogue, the chat screen leaves the page it was opened on.
 */
export function SignInPromptDialog({
  open,
  onDismiss,
  onClose = onDismiss,
  redirectTo,
  title,
  signInLabel,
  cancelLabel,
}: SignInPromptDialogProps) {
  const loginHref = `/auth/login?redirect=${encodeURIComponent(redirectTo)}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent className="sm:max-w-md" hideClose aria-describedby={undefined}>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
            <Lock size={24} aria-hidden="true" />
          </div>
          <DialogTitle className="leading-snug!">{title}</DialogTitle>
        </div>

        <DialogActions onCancel={onDismiss} cancelLabel={cancelLabel}>
          <SignInCta href={loginHref} dismiss={onClose} className="w-full sm:w-auto">
            {signInLabel}
          </SignInCta>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
