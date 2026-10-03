'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import { createPost, saveAndPublishPost } from '@/frontend/api/blogpress';

const TITLE_MAX = 200;
const BODY_MAX = 20000;
const DESCRIPTION_PREVIEW = 160;

/**
 * Turn a title into a public slug. Mirrors the editor's generator and the
 * server-side `PostSchema` allowed character set (word chars + Arabic + dash).
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF-]/g, '')
    .replace(/[\u060C\u061B\u061F\u0640\u066A\u066B\u066C\u066D\u06D4]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

function buildSlug(title: string): string {
  return (
    slugify(title) ||
    `post-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 8)}`
  );
}

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
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();

  const closeAndReset = useCallback(() => {
    setOpen(false);
    setTitle('');
    setBody('');
  }, []);

  const handleFabClick = useCallback(() => {
    if (!user) {
      const redirect = encodeURIComponent(pathname || '/community');
      router.push(`/auth/login?redirect=${redirect}`);
      return;
    }
    setOpen(true);
  }, [user, router, pathname]);

  const handlePublish = useCallback(() => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      toast.error('العنوان مطلوب');
      return;
    }
    if (!trimmedBody) {
      toast.error('اكتب نص المنشور أولاً');
      return;
    }

    startTransition(async () => {
      try {
        const slug = buildSlug(trimmedTitle);
        const { id } = await createPost();

        await saveAndPublishPost(id, {
          title: trimmedTitle,
          slug,
          content: trimmedBody,
          cover_image: '',
          meta_title: '',
          meta_desc: trimmedBody.slice(0, DESCRIPTION_PREVIEW),
        });

        toast.success('تمَّ نشر منشورك');
        closeAndReset();
        router.push(`/community/${slug}`);
        router.refresh();
      } catch {
        toast.error('فشل نشر المنشور');
      }
    });
  }, [title, body, closeAndReset, router]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) closeAndReset();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, pending, closeAndReset]);

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

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeAndReset())}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-center">منشور جديد</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="compose-title" required>
                العنوان
              </Label>
              <Input
                id="compose-title"
                value={title}
                maxLength={TITLE_MAX}
                disabled={pending}
                dir="auto"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="عنوان جذَّاب لمنشورك"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="compose-body" required>
                النَّص
              </Label>
              <Textarea
                id="compose-body"
                value={body}
                maxLength={BODY_MAX}
                minLength={1}
                showCount
                disabled={pending}
                dir="auto"
                onChange={(event) => setBody(event.target.value)}
                placeholder="اكتب ما يدور في ذهنك..."
                className="min-h-40"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button variant="outline" onClick={closeAndReset} disabled={pending}>
              إلغاء
            </Button>
            <Button
              isLoading={pending}
              onClick={handlePublish}
              className="border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 text-white hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500"
            >
              {pending ? 'جاري النَّشر...' : 'نشر'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
