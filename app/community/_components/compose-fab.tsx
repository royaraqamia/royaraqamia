'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { PenLine, Loader2, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { useSession } from '@/frontend/state/session-provider';
import { useUI } from '@/frontend/state/UIContext';
import {
  createPost,
  saveAndPublishPost,
  uploadImage,
  setPostTags,
  createTag,
} from '@/frontend/api/blogpress';

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

function withHashtags(body: string, rawTags: string): string {
  const tags = rawTags
    .split(/[,\u060C]/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 5);
  const feed = tags.length > 0 ? `${tags.map((tag) => `#${tag}`).join(' ')}\n\n` : '';
  const trimmed = body.trim();
  return feed ? `${feed}${trimmed}` : trimmed;
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
  const [tags, setTags] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const closeAndReset = useCallback(() => {
    setOpen(false);
    setTitle('');
    setBody('');
    setTags('');
    setCoverUrl('');
  }, []);

  const handleFabClick = useCallback(() => {
    if (!user) {
      const redirect = encodeURIComponent(pathname || '/community');
      router.push(`/auth/login?redirect=${redirect}`);
      return;
    }
    setOpen(true);
  }, [user, router, pathname]);

  const handleCoverSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('يجب أن يكون الملف صُورة');
      return;
    }
    setIsCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadImage(formData);
      if ('error' in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ('url' in result && result.url) {
        setCoverUrl(result.url);
      }
    } catch {
      toast.error('فشل رفع الصُّورة');
    } finally {
      setIsCoverUploading(false);
    }
  }, []);

  const handlePublish = useCallback(() => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      toast.error('العنوان مطلوب');
      return;
    }
    if (!trimmedBody) {
      toast.error('اكتب نص المقال أولاً');
      return;
    }

    startTransition(async () => {
      try {
        const slug = buildSlug(trimmedTitle);
        const { id } = await createPost();

        const tagList = tags
          .split(/[,\u060C]/)
          .map((tag) => tag.trim().replace(/^#/, ''))
          .filter(Boolean)
          .slice(0, 5);
        if (tagList.length > 0) {
          const tagIds = await Promise.all(
            tagList.map((name) =>
              createTag({
                name,
                slug: slugify(name) || `tag-${Math.random().toString(36).slice(2, 6)}`,
              })
                .then((res) => ('tag' in res ? res.tag.id : null))
                .catch(() => null)
            )
          );
          const validIds = tagIds.filter((tagId): tagId is string => Boolean(tagId));
          if (validIds.length > 0) {
            await setPostTags(id, validIds);
          }
        }

        await saveAndPublishPost(id, {
          title: trimmedTitle,
          slug,
          content: withHashtags(body, tags),
          cover_image: coverUrl,
          meta_title: '',
          meta_desc: trimmedBody.slice(0, DESCRIPTION_PREVIEW),
        });

        toast.success('تمَّ نشر مقالك');
        closeAndReset();
        router.push(`/community/${slug}`);
        router.refresh();
      } catch {
        toast.error('فشل نشر المقال');
      }
    });
  }, [title, body, tags, coverUrl, closeAndReset, router]);

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
        aria-label="إضافة مقال جديد"
        className="compose-fab-btn visible group"
      >
        <PenLine className="size-6 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-6" />
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeAndReset())}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>مقال جديد</DialogTitle>
            <DialogDescription>
              شارك فكرة مع المجتمع. سيظهر مقالك فوراً على صفحة المجتمع.
            </DialogDescription>
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
                onChange={(event) => setTitle(event.target.value)}
                placeholder="عنوان جذَّاب لمقالك"
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
                onChange={(event) => setBody(event.target.value)}
                placeholder="اكتب ما يدور في ذهنك..."
                className="min-h-40"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="compose-tags" optional>
                الوسوم
              </Label>
              <Input
                id="compose-tags"
                value={tags}
                disabled={pending}
                onChange={(event) => setTags(event.target.value)}
                placeholder="تقنية، تصميم، ريادة (مفصولة بفاصلة)"
              />
            </div>

            {coverUrl ? (
              <div className="relative overflow-hidden rounded-2xl border border-border">
                <div className="relative aspect-16/10 w-full">
                  <Image
                    src={coverUrl}
                    alt="صُورة الغلاف"
                    fill
                    className="object-cover"
                    sizes="600px"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCoverUrl('')}
                  disabled={pending}
                  aria-label="إزالة صُورة الغلاف"
                  className="absolute top-2 end-2 rounded-full bg-background/90 p-1.5 text-foreground ring-1 ring-border transition-safe hover:bg-background"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground transition-safe hover:border-primary/50 hover:text-foreground">
                {isCoverUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                <span>{isCoverUploading ? 'جاري الرَّفع...' : 'أضف صُورة غلاف (اختياري)'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isCoverUploading || pending}
                  onChange={handleCoverSelect}
                />
              </label>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button variant="outline" onClick={closeAndReset} disabled={pending}>
              إلغاء
            </Button>
            <Button isLoading={pending} onClick={handlePublish}>
              {pending ? 'جاري النَّشر...' : 'نشر'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
