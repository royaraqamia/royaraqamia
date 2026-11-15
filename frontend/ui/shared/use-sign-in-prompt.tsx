'use client';

import { useCallback, useState } from 'react';

import { ACCOUNT_ROWS_COPY } from '@/frontend/ui/account/account-rows-copy';

import { SignInPromptDialog } from './sign-in-prompt-dialog';

export interface SignInPrompt {
  /**
   * Opens the prompt, remembering the page the visitor asked for so signing in
   * returns them there instead of to the home page.
   */
  requireSignIn: (redirectTo: string) => void;
  /** The prompt itself. Render it once, beside the control that opens it. */
  dialog: React.ReactNode;
}

/**
 * The guest gate every control shares (#1500).
 *
 * A visitor who presses a button that needs a session used to leave the page for
 * `/auth/login`. The prompt asks the question where they are, and the sign-in
 * page still carries the destination — so the flow is the same, minus the
 * bounce. The words are the site's own (`shared/copy/account-rows.json`), not
 * retyped per surface, so every prompt reads the same; `title` is for the few
 * surfaces whose question is narrower than "continue" (posting, sources, links)
 * and whose line the app already draws.
 */
export function useSignInPrompt(title?: string): SignInPrompt {
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  const requireSignIn = useCallback((href: string) => setRedirectTo(href), []);
  const dismiss = useCallback(() => setRedirectTo(null), []);

  const dialog = (
    <SignInPromptDialog
      open={redirectTo !== null}
      onDismiss={dismiss}
      redirectTo={redirectTo ?? '/'}
      title={title ?? ACCOUNT_ROWS_COPY.signInPrompt}
      signInLabel={ACCOUNT_ROWS_COPY.signIn}
      cancelLabel={ACCOUNT_ROWS_COPY.cancel}
    />
  );

  return { requireSignIn, dialog };
}
