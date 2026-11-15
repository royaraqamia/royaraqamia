'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Settings2 } from 'lucide-react';

import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { FabButton } from '@/frontend/ui/shared/fab-button';
import { useSignInPrompt } from '@/frontend/ui/shared/use-sign-in-prompt';

/** Where the FAB lands, and where a visitor returns once they have signed in. */
const SOURCES_PATH = '/account/news';

/**
 * The digest's own settings entry: a gear that opens the reader's news sources.
 *
 * `/news` is a public, personalisation-optional surface, so the FAB asks a
 * visitor to sign in instead of bouncing them off the page — the site's one
 * sign-in prompt, worded for sources rather than for continuing.
 */
export function NewsSettingsFab() {
  const { user, isLoading } = useSession();
  const { isReviewSheetOpen } = useUI();
  const router = useRouter();
  const { requireSignIn, dialog: signInPrompt } = useSignInPrompt(
    'سجِّل الدُّخول لاختيار مصادر الأخبار'
  );

  const handleFabClick = useCallback(() => {
    if (!user) {
      requireSignIn(SOURCES_PATH);
      return;
    }
    router.push(SOURCES_PATH);
  }, [router, user, requireSignIn]);

  if (isLoading || isReviewSheetOpen) return null;

  return (
    <>
      <FabButton id="btn-news-settings" label="مصادر الأخبار" onClick={handleFabClick}>
        <Settings2 className="size-6 transition-transform duration-200 ease-out group-hover:rotate-90" />
      </FabButton>

      {signInPrompt}
    </>
  );
}
