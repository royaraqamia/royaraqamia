'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { PostComposerDialog } from './post-composer-dialog';

/**
 * Facebook/X-style composer for the public community. Signed-in users can publish a
 * post without ever leaving `/community`; anonymous visitors are sent to login with
 * a redirect back.
 */
export function ComposeFab() {
  const { user, isLoading } = useSession();
  const { isMobileMenuOpen, isReviewSheetOpen } = useUI();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleFabClick = useCallback(() => {
    if (!user) {
      const redirect = encodeURIComponent(pathname || '/community');
      router.push(`/auth/login?redirect=${redirect}`);
      return;
    }
    setOpen(true);
  }, [user, router, pathname]);

  const handleSaved = useCallback(
    (slug: string) => {
      router.push(`/community/${slug}`);
      router.refresh();
    },
    [router]
  );

  if (isLoading || isMobileMenuOpen || isReviewSheetOpen) return null;

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
    </>
  );
}
