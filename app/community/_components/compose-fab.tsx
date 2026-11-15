'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { useSignInPrompt } from '@/frontend/ui/shared/use-sign-in-prompt';
import { PostComposerDialog } from '@/frontend/ui/community/post-composer-dialog';
import { COMMUNITY_COMPOSE_FAB_COPY } from './community-compose-fab-copy';

/**
 * Facebook/X-style composer for the public community. Signed-in users can publish a
 * post without ever leaving `/community`; anonymous visitors get the same prompt the
 * notification bell gives them — the site's one sign-in gate — instead of a hard
 * redirect.
 */
export function ComposeFab() {
  const { user, isLoading } = useSession();
  const { isReviewSheetOpen } = useUI();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { requireSignIn, dialog: signInPrompt } = useSignInPrompt(
    COMMUNITY_COMPOSE_FAB_COPY.guestTitle
  );

  const handleFabClick = useCallback(() => {
    if (!user) {
      requireSignIn(pathname || '/community');
      return;
    }
    setOpen(true);
  }, [user, pathname, requireSignIn]);

  const handleSaved = useCallback(
    (slug: string) => {
      router.push(`/community/${slug}`);
      router.refresh();
    },
    [router]
  );

  if (isLoading || isReviewSheetOpen) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleFabClick}
        aria-label={COMMUNITY_COMPOSE_FAB_COPY.newPostLabel}
        className="compose-fab-btn visible group"
      >
        <PenLine className="size-6 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-6" />
      </button>

      <PostComposerDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={handleSaved}
        onDraftSaved={() => {
          setOpen(false);
          router.push('/account/posts');
        }}
      />

      {signInPrompt}
    </>
  );
}
