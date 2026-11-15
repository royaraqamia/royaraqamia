'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Link2 } from 'lucide-react';

import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { FabButton } from '@/frontend/ui/shared/fab-button';
import { useSignInPrompt } from '@/frontend/ui/shared/use-sign-in-prompt';

import { LINKSNAP_LINKS_FAB_COPY } from './linksnap-links-fab-copy';

/** Where the FAB lands, and where a visitor returns once they have signed in. */
const LINKS_PATH = '/account/links';

/**
 * The shortener's own links entry: the same FAB `/news` wears, opening the
 * reader's owned links.
 *
 * `/linksnap` is a public, sign-in-optional surface, so the FAB asks a visitor
 * to sign in instead of bouncing them off the page — the site's one sign-in
 * prompt, worded for links rather than for continuing.
 */
export function LinksnapLinksFab() {
  const { user, isLoading } = useSession();
  const { isReviewSheetOpen } = useUI();
  const router = useRouter();
  const { requireSignIn, dialog: signInPrompt } = useSignInPrompt(
    LINKSNAP_LINKS_FAB_COPY.guestTitle
  );

  const handleFabClick = useCallback(() => {
    if (!user) {
      requireSignIn(LINKS_PATH);
      return;
    }
    router.push(LINKS_PATH);
  }, [router, user, requireSignIn]);

  if (isLoading || isReviewSheetOpen) return null;

  return (
    <>
      <FabButton
        id="btn-linksnap-links"
        label={LINKSNAP_LINKS_FAB_COPY.label}
        onClick={handleFabClick}
      >
        <Link2 className="size-6 transition-transform duration-200 ease-out group-hover:rotate-90" />
      </FabButton>

      {signInPrompt}
    </>
  );
}
