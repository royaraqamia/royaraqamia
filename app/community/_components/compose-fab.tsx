'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogIn, PenLine } from 'lucide-react';
import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { Button } from '@/frontend/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
          <DialogHeader className="items-center text-center">
            <div className="mx-auto mb-1 flex size-14 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/80 border border-border/40 shadow-inner">
              <PenLine size={24} />
            </div>
            <DialogTitle>سجِّل الدُّخول للنَّشر في المُجتمع</DialogTitle>
            <DialogDescription>
              لنشر منشور في المُجتمع، يلزمك تسجيل الدُّخول إلى حسابك أوَّلًا.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="sm:justify-center">
            <Button asChild className="w-full sm:w-auto">
              <Link href={loginHref} onClick={() => setAuthPromptOpen(false)}>
                <LogIn className="size-4" />
                تسجيل الدُّخول
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
