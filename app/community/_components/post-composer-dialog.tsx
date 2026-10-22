'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { createPost, saveAndPublishPost, updatePost } from '@/frontend/api/blogpress';
import { showActionError } from '@/frontend/ui/plans/show-plan-error';

const BODY_MAX = 20000;
const DESCRIPTION_PREVIEW = 160;

export interface PostComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (slug: string) => void;
  mode?: 'create' | 'edit';
  postId?: string;
  slug?: string;
  initialBody?: string;
  coverImage?: string;
  metaTitle?: string;
}

/**
 * Every community post gets the same URL-safe identifier shape — `post-xxxxxxxx`
 * — so the (title-less) post's slug never depends on its content language.
 */
function buildSlug(): string {
  return `post-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 8)}`;
}

/**
 * Facebook-style composer for the public community. Renders the same form for a
 * brand-new post (`create`) and for editing an existing one (`edit`), so the FAB
 * and the per-post action menu share a single surface.
 */
export function PostComposerDialog({
  open,
  onOpenChange,
  onSaved,
  mode = 'create',
  postId,
  slug,
  initialBody = '',
  coverImage = '',
  metaTitle = '',
}: PostComposerDialogProps) {
  const isEdit = mode === 'edit';
  const [body, setBody] = useState(initialBody);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setBody(initialBody);
  }, [open, initialBody]);

  const handleSubmit = () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      toast.error('اكتب نص المنشور أولاً');
      return;
    }

    startTransition(async () => {
      try {
        if (isEdit) {
          if (!postId || !slug) return;
          const result = await updatePost(postId, {
            slug,
            content: trimmedBody,
            cover_image: coverImage,
            meta_title: metaTitle,
            meta_desc: trimmedBody.slice(0, DESCRIPTION_PREVIEW),
          });
          if (result?.message === 'تمَّ حفظ المنشور') {
            toast.success('تمَّ حفظ التعديلات');
            onOpenChange(false);
            onSaved(slug);
          } else if (result?.errors) {
            toast.error('تحقَّق من الحقول المطلوبة');
          } else {
            toast.error('فشل حفظ التعديلات');
          }
          return;
        }

        const newSlug = buildSlug();
        const { id } = await createPost();
        await saveAndPublishPost(id, {
          slug: newSlug,
          content: trimmedBody,
          cover_image: '',
          meta_title: '',
          meta_desc: trimmedBody.slice(0, DESCRIPTION_PREVIEW),
        });
        toast.success('تمَّ نشر منشورك');
        onOpenChange(false);
        onSaved(newSlug);
      } catch (error) {
        showActionError(error, isEdit ? 'فشل حفظ التعديلات' : 'فشل نشر المنشور');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:flex max-sm:h-dvh max-sm:w-full max-sm:max-w-none max-sm:max-h-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:rounded-none sm:max-w-xl sm:max-h-[calc(100dvh_-_2rem)]">
        <DialogHeader>
          <DialogTitle className="text-center">
            {isEdit ? 'تعديل المنشور' : 'منشور جديد'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col">
          <div className="space-y-1.5 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:[&>div]:flex-1 max-sm:[&>div>textarea]:h-full">
            <Label htmlFor="composer-body" required>
              النَّص
            </Label>
            <Textarea
              id="composer-body"
              value={body}
              maxLength={BODY_MAX}
              minLength={1}
              showCount
              disabled={pending}
              dir="auto"
              onChange={(event) => setBody(event.target.value)}
              placeholder="اكتب ما يدور في ذهنك..."
              className="min-h-40 placeholder-shown:[direction:rtl]"
            />
          </div>
        </div>

        <DialogActions onCancel={() => onOpenChange(false)}>
          <HeroCtaButton
            type="button"
            isLoading={pending}
            onClick={handleSubmit}
            className="w-full sm:w-auto"
          >
            {isEdit ? 'حفظ التعديلات' : 'نشر'}
          </HeroCtaButton>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
