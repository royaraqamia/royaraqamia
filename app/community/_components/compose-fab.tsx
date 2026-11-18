'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { useSignInPrompt } from '@/frontend/ui/shared/use-sign-in-prompt';
import {
  type ComposerDraftHandle,
  PostComposerDialog,
} from '@/frontend/ui/community/post-composer-dialog';
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
  /** The draft a writer chose to resume; null means the FAB is writing a new one. */
  const [resume, setResume] = useState<ComposerDraftHandle | null>(null);
  const { requireSignIn, dialog: signInPrompt } = useSignInPrompt(
    COMMUNITY_COMPOSE_FAB_COPY.guestTitle
  );

  const handleFabClick = useCallback(() => {
    if (!user) {
      requireSignIn(pathname || '/community');
      return;
    }
    setResume(null);
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
        mode={resume ? 'edit' : 'create'}
        postId={resume?.id}
        slug={resume?.slug ?? undefined}
        initialBody={resume?.content ?? ''}
        coverImage={resume?.coverImage ?? ''}
        metaTitle={resume?.metaTitle ?? ''}
        initialStatus={resume?.status}
        initialPublishAt={resume?.publishAt ?? null}
        onDraftSaved={(draft) => {
          toast.success(COMMUNITY_COMPOSE_FAB_COPY.draftSaved, {
            action: {
              label: COMMUNITY_COMPOSE_FAB_COPY.resumeDraft,
              onClick: () => {
                setResume(draft);
                setOpen(true);
              },
            },
          });
        }}
      />

      {signInPrompt}
    </>
  );
}
