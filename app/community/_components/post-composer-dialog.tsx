'use client';

import { useEffect, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Label } from '@/frontend/ui/primitives/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import { createPost, updatePost } from '@/frontend/api/blogpress';
import { showActionError } from '@/frontend/ui/plans/show-plan-error';
import { stripMarkdown } from '@/shared/reading-time';

const BODY_MAX = 20000;
const DESCRIPTION_PREVIEW = 160;

/**
 * The editor is Tiptap, `marked` and `turndown` — a third of `/community`'s
 * budget, and a reader who only scrolls the feed never needs it. It arrives as
 * its own chunk when a composer opens, and a chunk that cannot be fetched
 * renders the frame rather than taking the page down with it.
 */
const NoteBodyEditor = dynamic(
  tolerateChunkFailure('post editor', () =>
    import('@/frontend/ui/notes/note-body-editor').then((module) => ({
      default: module.NoteBodyEditor,
    }))
  ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-40 animate-pulse rounded-xl bg-muted/20" aria-hidden="true" />
    ),
  }
);

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

  const charCount = body.length;

  const handleSubmit = () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      toast.error('اكتب نص المنشور أولاً');
      return;
    }
    if (charCount > BODY_MAX) {
      toast.error(`النَّصّ أطول من الحدّ المسموح (${BODY_MAX} حرفًا)`);
      return;
    }

    // What a reader sees in the feed and in a shared preview: the Markdown
    // syntax the editor writes is not part of it.
    const description = stripMarkdown(trimmedBody).slice(0, DESCRIPTION_PREVIEW);

    startTransition(async () => {
      try {
        if (isEdit) {
          if (!postId || !slug) return;
          const result = await updatePost(postId, {
            slug,
            content: trimmedBody,
            cover_image: coverImage,
            meta_title: metaTitle,
            meta_desc: description,
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
        await createPost({
          slug: newSlug,
          content: trimmedBody,
          cover_image: '',
          meta_title: '',
          meta_desc: description,
          status: 'published',
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
      <DialogContent className="max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:flex max-sm:h-dvh max-sm:w-full max-sm:max-w-none max-sm:max-h-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:rounded-none dialog-scrollbar-touch-none sm:max-w-xl sm:max-h-[calc(100dvh_-_2rem)]">
        <DialogHeader>
          <DialogTitle className="text-center">
            {isEdit ? 'تعديل المنشور' : 'منشور جديد'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col">
          <div className="space-y-1.5 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col">
            <Label htmlFor="composer-body" required>
              النَّص
            </Label>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-input/80 bg-background/80">
              <NoteBodyEditor
                initialMarkdown={initialBody}
                onChange={setBody}
                id="composer-body"
                ariaLabel="نص المنشور"
                placeholder="اكتب ما يدور في ذهنك..."
                surfaceClassName="min-h-40 max-sm:min-h-0"
              />
            </div>
            <p
              aria-live="polite"
              className={
                charCount > BODY_MAX
                  ? 'text-[11px] font-bold text-destructive'
                  : 'text-[11px] text-muted-foreground'
              }
            >
              {charCount} / {BODY_MAX.toLocaleString('en-US')}
            </p>
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
