'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { PostComposerDialog } from './post-composer-dialog';

/**
 * Facebook/X-style composer for the public community. Signed-in users can publish a
 * post without ever leaving `/community`; anonymous visitors get the same nudge the
 * notification bell gives them — a prompt to sign in — instead of a hard redirect.
 */
export function ComposeFab() {
  const { user, isLoading } = useSession();
  const { isReviewSheetOpen } = useUI();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  const loginHref = `/auth/login?redirect=${encodeURIComponent(pathname || '/community')}`;

  const handleFabClick = useCallback(() => {
    if (!user) {
      setAuthPromptOpen(true);
      return;
    }
    setOpen(true);
  }, [user]);

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
        aria-label="إضافة منشور جديد"
        className="compose-fab-btn visible group"
      >
        <PenLine className="size-6 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-6" />
      </button>

      <PostComposerDialog open={open} onOpenChange={setOpen} onSaved={handleSaved} />

      <Dialog open={authPromptOpen} onOpenChange={setAuthPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
              <PenLine size={24} />
            </div>
            <div className="space-y-1.5">
              <DialogTitle className="leading-snug!">
                سجِّل الدُّخول للنَّشر في المُجتمع
              </DialogTitle>
              <DialogDescription className="text-pretty">
                لنشر منشور في المُجتمع، يلزمك تسجيل الدُّخول إلى حسابك أوَّلًا.
              </DialogDescription>
            </div>
          </div>

          <DialogFooter className="sm:justify-center">
            <SignInCta href={loginHref} onClick={() => setAuthPromptOpen(false)} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
