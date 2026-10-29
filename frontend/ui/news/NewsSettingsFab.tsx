'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings2 } from 'lucide-react';

import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { FabButton } from '@/frontend/ui/shared/fab-button';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';

/** Where the FAB lands, and where a visitor returns once they have signed in. */
const SOURCES_PATH = '/account/news';

/**
 * The digest's own settings entry: a gear that opens the reader's news sources.
 *
 * `/news` is a public, personalisation-optional surface, so the FAB asks a
 * visitor to sign in instead of bouncing them off the page — the same prompt the
 * community composer shows, worded for sources rather than for posting.
 */
export function NewsSettingsFab() {
  const { user, isLoading } = useSession();
  const { isReviewSheetOpen } = useUI();
  const router = useRouter();
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  const loginHref = `/auth/login?redirect=${encodeURIComponent(SOURCES_PATH)}`;

  const handleFabClick = useCallback(() => {
    if (!user) {
      setAuthPromptOpen(true);
      return;
    }
    router.push(SOURCES_PATH);
  }, [router, user]);

  if (isLoading || isReviewSheetOpen) return null;

  return (
    <>
      <FabButton id="btn-news-settings" label="مصادر الأخبار" onClick={handleFabClick}>
        <Settings2 className="size-6 transition-transform duration-200 ease-out group-hover:rotate-90" />
      </FabButton>

      <Dialog open={authPromptOpen} onOpenChange={setAuthPromptOpen}>
        <DialogContent className="sm:max-w-md" hideClose aria-describedby={undefined}>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
              <Settings2 size={24} />
            </div>
            <DialogTitle className="leading-snug!">
              سجِّل الدُّخول لاختيار مصادر الأخبار
            </DialogTitle>
          </div>

          <DialogActions onCancel={() => setAuthPromptOpen(false)}>
            <SignInCta
              href={loginHref}
              onClick={() => setAuthPromptOpen(false)}
              className="w-full sm:w-auto"
            />
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  );
}
