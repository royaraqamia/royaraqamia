'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2 } from 'lucide-react';

import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { FabButton } from '@/frontend/ui/shared/fab-button';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';

import { LINKSNAP_LINKS_FAB_COPY } from './linksnap-links-fab-copy';

/** Where the FAB lands, and where a visitor returns once they have signed in. */
const LINKS_PATH = '/account/links';

/**
 * The shortener's own links entry: the same FAB `/news` wears, opening the
 * reader's owned links.
 *
 * `/linksnap` is a public, sign-in-optional surface, so the FAB asks a visitor
 * to sign in instead of bouncing them off the page — the prompt
 * `NewsSettingsFab` shows, worded for links rather than for news sources.
 */
export function LinksnapLinksFab() {
  const { user, isLoading } = useSession();
  const { isReviewSheetOpen } = useUI();
  const router = useRouter();
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  const loginHref = `/auth/login?redirect=${encodeURIComponent(LINKS_PATH)}`;

  const handleFabClick = useCallback(() => {
    if (!user) {
      setAuthPromptOpen(true);
      return;
    }
    router.push(LINKS_PATH);
  }, [router, user]);

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

      <Dialog open={authPromptOpen} onOpenChange={setAuthPromptOpen}>
        <DialogContent className="sm:max-w-md" hideClose aria-describedby={undefined}>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
              <Link2 size={24} />
            </div>
            <DialogTitle className="leading-snug!">
              {LINKSNAP_LINKS_FAB_COPY.guestTitle}
            </DialogTitle>
          </div>

          <DialogActions onCancel={() => setAuthPromptOpen(false)}>
            <SignInCta
              href={loginHref}
              dismiss={() => setAuthPromptOpen(false)}
              className="w-full sm:w-auto"
            />
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  );
}
