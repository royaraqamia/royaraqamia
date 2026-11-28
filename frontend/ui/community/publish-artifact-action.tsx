'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { createPostFromArtifact } from '@/frontend/api/blogpress';
import { useSession } from '@/frontend/state/session-provider';
import { Button } from '@/frontend/ui/primitives/button';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { useSignInPrompt } from '@/frontend/ui/shared/use-sign-in-prompt';
import { PostComposerDialog } from './post-composer-dialog';
import type { ArtifactPostDraftResponse } from '@/shared/contracts/community';
import type { PostSourceKind } from '@/shared/contracts/blogpress';

/**
 * The artifact door's words (#1952).
 *
 * They live here rather than in a generated copy source because this control is
 * web-only on purpose: the issue's non-goals exclude native work, and the APK
 * draws the note and chat routes in its WebView. The copy gate exists to hold
 * one word against a second native client; there is no second client here.
 */
const COPY = {
  label: 'انشر في المجتمع',
  title: 'نشر في المجتمع',
  message:
    'ستُنشأ مسوَّدة منشور من هذا النصّ باسمك، وتبقى قابلة للتحرير قبل النشر. لا يُنشر شيء قبل أن تؤكّد.',
  confirm: 'إنشاء المسوَّدة',
  cancel: 'إلغاء',
  success: 'أُنشئت المسوَّدة',
  failed: 'تعذّر إنشاء المسوَّدة',
} as const;

interface PublishArtifactActionProps {
  kind: PostSourceKind;
  artifactId: string;
  /**
   * Lands the surface's pending write before the server reads the artifact. A
   * note autosaves on a debounce, so the latest keystroke may not be stored yet.
   */
  beforeRequest?: () => Promise<void>;
  /** `secondary` is a bordered button beside a footer's primary; `quiet` is a text control. */
  variant?: 'secondary' | 'quiet';
  className?: string;
  /** Where a guest returns after signing in. Defaults to the community hub. */
  signInReturnTo?: string;
  /** The guest prompt's question; omitted surfaces never see a guest click. */
  signInTitle?: string;
}

/**
 * One publish action for the text the member already produced (#1952).
 *
 * A note and an assistant answer each mount this: it asks once, creates a post
 * draft from the artifact's id (the server reads the text, the byline is the
 * member's, the source is recorded), then opens the community composer on that
 * draft so publishing is an edit away rather than a second act of authorship.
 */
export function PublishArtifactAction({
  kind,
  artifactId,
  beforeRequest,
  variant = 'secondary',
  className,
  signInReturnTo = '/community',
  signInTitle,
}: PublishArtifactActionProps) {
  const router = useRouter();
  const { user } = useSession();
  const signIn = useSignInPrompt(signInTitle);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [draft, setDraft] = useState<ArtifactPostDraftResponse | null>(null);

  const handleTrigger = useCallback(() => {
    // A note can exist on a guest's device, but a post cannot: the gate is the
    // same one the community FAB uses (#1500), rather than a refusal after the
    // request has travelled.
    if (!user) {
      signIn.requireSignIn(signInReturnTo);
      return;
    }
    setConfirmOpen(true);
  }, [signIn, signInReturnTo, user]);

  const handleConfirm = useCallback(() => {
    setWorking(true);
    void (async () => {
      try {
        await beforeRequest?.();
        const created = await createPostFromArtifact({ kind, id: artifactId });
        setConfirmOpen(false);
        setDraft(created);
        toast.success(COPY.success);
      } catch {
        toast.error(COPY.failed);
      } finally {
        setWorking(false);
      }
    })();
  }, [artifactId, beforeRequest, kind]);

  const handleSaved = useCallback(
    (slug: string) => {
      router.push(`/community/${slug}`);
      router.refresh();
    },
    [router]
  );

  return (
    <>
      <Button
        type="button"
        variant={variant === 'secondary' ? 'outline' : 'ghost'}
        onClick={handleTrigger}
        disabled={working}
        className={
          variant === 'secondary'
            ? `max-sm:w-full sm:w-auto rounded-xl px-4 max-sm:h-13 sm:h-14 text-[14px] ${className ?? ''}`
            : `h-auto p-0 text-[11px] font-bold text-primary hover:bg-transparent hover:underline underline-offset-2 ${className ?? ''}`
        }
      >
        {COPY.label}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        variant="default"
        title={COPY.title}
        message={COPY.message}
        confirmLabel={COPY.confirm}
        cancelLabel={COPY.cancel}
        isConfirming={working}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (!working) setConfirmOpen(false);
        }}
      />

      {draft ? (
        <PostComposerDialog
          open
          onOpenChange={(next) => (next ? undefined : setDraft(null))}
          onSaved={handleSaved}
          mode="edit"
          postId={draft.id}
          slug={draft.slug}
          initialBody={draft.content}
          metaTitle={draft.metaTitle}
          initialStatus="draft"
        />
      ) : null}

      {signIn.dialog}
    </>
  );
}
