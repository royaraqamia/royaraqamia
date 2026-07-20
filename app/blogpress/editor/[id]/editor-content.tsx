'use client';

import { useState, useCallback, useEffect, useRef, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Settings,
  Eye,
  EyeOff,
  Upload,
  ArrowRight,
  Loader2,
  ImageIcon,
  Link2,
  Search,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { updatePost, publishPost } from '@/domains/blogpress/lib/actions/posts';
import { uploadImage } from '@/domains/blogpress/lib/actions/media';
import { toast } from 'sonner';
import type { Post } from '@/domains/blogpress/lib/definitions';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com';

interface EditorContentProps {
  post: Post;
}

export function EditorContent({ post }: EditorContentProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content ?? '');
  const [slug, setSlug] = useState(post.slug);
  const [coverImage, setCoverImage] = useState(post.cover_image ?? '');
  const [metaTitle, setMetaTitle] = useState(post.meta_title ?? '');
  const [metaDesc, setMetaDesc] = useState(post.meta_desc ?? '');
  const [isPreview, setIsPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const contentRef = useRef(content);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);

  const wordCount = useMemo(() => {
    const text = content.replace(/[#*_`~>[\\]!|-]/g, '').trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }, [content]);

  const readingTimeMinutes = useMemo(() => {
    return Math.max(1, Math.ceil(wordCount / 180));
  }, [wordCount]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const allFieldsRef = useRef({ title, slug, content, coverImage, metaTitle, metaDesc });

  useEffect(() => {
    allFieldsRef.current = { title, slug, content, coverImage, metaTitle, metaDesc };
  }, [title, slug, content, coverImage, metaTitle, metaDesc]);

  useEffect(() => {
    isDirtyRef.current = true;
  }, [title, content, slug, coverImage, metaTitle, metaDesc]);

  const saveAllFields = useCallback(async () => {
    if (!isDirtyRef.current) return;
    const f = allFieldsRef.current;
    const formData = new FormData();
    formData.append('title', f.title);
    formData.append('slug', f.slug);
    formData.append('content', f.content);
    formData.append('cover_image', f.coverImage);
    formData.append('meta_title', f.metaTitle);
    formData.append('meta_desc', f.metaDesc);
    try {
      const result = await updatePost(post.id, undefined, formData);
      if (result?.message === 'تم حفظ المقال') {
        isDirtyRef.current = false;
        setLastSaved(new Date());
      }
    } catch {
      // Silently fail on auto-save
    }
  }, [post.id]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isDirtyRef.current) {
        saveAllFields();
      }
    };
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveAllFields]);

  const handleImageUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadImage(formData);
    setIsUploading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.url) {
      const markdown = `![${file.name}](${result.url})`;
      setContent((prev) => prev + (prev ? '\n\n' : '') + markdown);
      toast.success('تم رفع الصورة');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleImageUpload(file);
      }
    },
    [handleImageUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleImageUpload(file);
      }
    },
    [handleImageUpload]
  );

  const generateSlug = useCallback((text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 200);
  }, []);

  const handleSave = useCallback(async () => {
    const finalSlug = slug.startsWith('بدون-عنوان-') || slug === '' ? generateSlug(title) : slug;
    if (finalSlug !== slug) setSlug(finalSlug);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('slug', finalSlug);
    formData.append('content', content);
    formData.append('cover_image', coverImage);
    formData.append('meta_title', metaTitle);
    formData.append('meta_desc', metaDesc);

    startTransition(async () => {
      const result = await updatePost(post.id, undefined, formData);
      if (result?.message === 'تم حفظ المقال') {
        isDirtyRef.current = false;
        toast.success('تم حفظ المقال');
      } else if (result?.errors) {
        toast.error('خطأ في التحقق من البيانات');
      }
    });
  }, [post.id, title, slug, content, coverImage, metaTitle, metaDesc, generateSlug]);

  const handleTitleBlur = useCallback(() => {
    if (title && (slug === '' || slug.startsWith('بدون-عنوان-'))) {
      setSlug(generateSlug(title));
    }
  }, [title, slug, generateSlug]);

  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      saveAllFields();
    }, 1000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [saveAllFields]);

  const handlePublish = useCallback(async () => {
    const finalSlug = slug.startsWith('بدون-عنوان-') || slug === '' ? generateSlug(title) : slug;
    if (finalSlug !== slug) setSlug(finalSlug);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('slug', finalSlug);
    formData.append('content', content);
    formData.append('cover_image', coverImage);
    formData.append('meta_title', metaTitle);
    formData.append('meta_desc', metaDesc);

    startTransition(async () => {
      const result = await updatePost(post.id, undefined, formData);

      if (result?.errors) {
        toast.error('يرجى إصلاح أخطاء التحقق قبل النشر');
        return;
      }

      try {
        await publishPost(post.id);
      } catch {
        toast.error('فشل نشر المقال. حاول مرة أخرى.');
        return;
      }

      isDirtyRef.current = false;
      toast.success('تم نشر المقال!');
      router.refresh();
      router.push(`/blog/${finalSlug}`);
    });
  }, [
    post.id,
    title,
    slug,
    content,
    coverImage,
    metaTitle,
    metaDesc,
    generateSlug,
    startTransition,
    router,
  ]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!pending) handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!pending && post.status === 'draft') handlePublish();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pending, handleSave, handlePublish, post.status]);

  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push('/blogpress')}
            className="shrink-0 transition-smooth"
            aria-label="العودة إلى لوحة التحكم"
          >
            <ArrowRight className="size-4" />
          </Button>
          <Label htmlFor="editor-title" className="sr-only">
            عنوان المقال
          </Label>
          <Input
            id="editor-title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="عنوان المقال..."
            className="border-0 text-lg font-semibold bg-transparent px-0 focus-visible:ring-0 h-auto placeholder:text-muted-foreground/50 transition-smooth"
          />
        </div>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="text-muted-foreground hover:text-foreground transition-smooth hidden sm:inline-flex min-h-[44px]"
          >
            {isUploading ? (
              <Loader2 className="size-4 ms-1.5 animate-spin" />
            ) : (
              <Upload className="size-4 ms-1.5" />
            )}
            {isUploading ? 'جارٍ الرفع...' : 'صورة'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPreview(!isPreview)}
            className={
              isPreview
                ? 'text-primary min-h-[44px]'
                : 'text-muted-foreground hover:text-foreground transition-smooth min-h-[44px]'
            }
          >
            {isPreview ? <EyeOff className="size-4 ms-1.5" /> : <Eye className="size-4 ms-1.5" />}
            <span className="hidden sm:inline">{isPreview ? 'تعديل' : 'معاينة'}</span>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground transition-smooth"
                aria-label="إعدادات المقال"
              >
                <Settings className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>إعدادات المقال</SheetTitle>
                <SheetDescription>تكوين بيانات SEO وخيارات النشر</SheetDescription>
              </SheetHeader>
              <div className="mt-6 grid gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Link2 className="size-4 text-muted-foreground" />
                    الرابط
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="slug" className="text-xs text-muted-foreground">
                      رابط URL
                    </Label>
                    <Input
                      id="slug"
                      name="slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="رابط-المقال"
                      className="transition-smooth min-h-11"
                      dir="ltr"
                    />
                    <p className="text-xs text-muted-foreground">
                      <span className="text-muted-foreground/60">
                        {new URL(SITE_URL).host}/blog/
                      </span>
                      {slug || <span className="text-muted-foreground/40">رابط-المقال</span>}
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      يتم إنشاؤه تلقائياً من العنوان عند ترك حقل العنوان
                    </p>
                  </div>
                </div>

                <div className="h-px bg-border/50" />

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ImageIcon className="size-4 text-muted-foreground" />
                    صورة الغلاف
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cover_image" className="text-xs text-muted-foreground">
                      رابط الصورة
                    </Label>
                    <Input
                      id="cover_image"
                      name="cover_image"
                      value={coverImage}
                      onChange={(e) => setCoverImage(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="transition-smooth min-h-11"
                      dir="ltr"
                    />
                    <p className="text-xs text-muted-foreground/60">
                      PNG أو JPG أو WebP. يُفضل أبعاد 1200×630 بكسل.
                    </p>
                  </div>
                  {coverImage ? (
                    <div className="relative aspect-video overflow-hidden rounded-lg border border-border/50 bg-muted">
                      <Image
                        src={coverImage}
                        alt="معاينة صورة الغلاف"
                        fill
                        sizes="100vw"
                        unoptimized
                        className="object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center aspect-video rounded-lg border border-dashed border-border/60 bg-muted/30 text-center">
                      <ImageIcon className="size-8 text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">
                        أضف رابط صورة الغلاف لمعاينتها هنا
                      </p>
                    </div>
                  )}
                </div>

                <div className="h-px bg-border/50" />

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Search className="size-4 text-muted-foreground" />
                    تحسين محركات البحث (SEO)
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed">
                    هذه البيانات تظهر في نتائج البحث وعند مشاركة المقال على وسائل التواصل. إذا
                    تركتها فارغة، سيتم استخدام عنوان المقال ووصف تلقائي.
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="meta_title" className="text-xs text-muted-foreground">
                      عنوان SEO
                    </Label>
                    <Input
                      id="meta_title"
                      name="meta_title"
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      placeholder={title || 'عنوان SEO مخصص'}
                      maxLength={70}
                      className="transition-smooth min-h-11"
                    />
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-xs transition-smooth ${metaTitle.length > 60 ? (metaTitle.length >= 70 ? 'text-destructive font-medium' : 'text-warning dark:text-warning') : 'text-muted-foreground'}`}
                      >
                        {metaTitle.length}/70
                      </p>
                      {metaTitle.length > 0 && metaTitle.length <= 60 && (
                        <p className="text-xs text-success dark:text-success">ممتاز</p>
                      )}
                      {metaTitle.length > 60 && metaTitle.length < 70 && (
                        <p className="text-xs text-warning dark:text-warning">يقترب من الحد</p>
                      )}
                      {metaTitle.length >= 70 && (
                        <p className="text-xs text-destructive font-medium">
                          تم الوصول للحد الأقصى
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="meta_desc" className="text-xs text-muted-foreground">
                      وصف SEO
                    </Label>
                    <Textarea
                      id="meta_desc"
                      name="meta_desc"
                      value={metaDesc}
                      onChange={(e) => setMetaDesc(e.target.value)}
                      placeholder="وصف مختصر يظهر في نتائج البحث"
                      maxLength={160}
                      rows={3}
                      className="transition-smooth resize-none min-h-[5.5rem]"
                    />
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-xs transition-smooth ${metaDesc.length > 140 ? (metaDesc.length >= 160 ? 'text-destructive font-medium' : 'text-warning dark:text-warning') : 'text-muted-foreground'}`}
                      >
                        {metaDesc.length}/160
                      </p>
                      {metaDesc.length > 0 && metaDesc.length <= 140 && (
                        <p className="text-xs text-success dark:text-success">ممتاز</p>
                      )}
                      {metaDesc.length > 140 && metaDesc.length < 160 && (
                        <p className="text-xs text-warning dark:text-warning">يقترب من الحد</p>
                      )}
                      {metaDesc.length >= 160 && (
                        <p className="text-xs text-destructive font-medium">
                          تم الوصول للحد الأقصى
                        </p>
                      )}
                    </div>
                  </div>

                  {(metaTitle || metaDesc) && (
                    <>
                      <div className="h-px bg-border/50" />
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          معاينة في نتائج البحث
                        </p>
                        <div className="rounded-lg border border-border/50 bg-background p-3 space-y-1">
                          <p className="text-sm font-medium text-primary truncate">
                            {metaTitle || title || 'عنوان المقال'}
                          </p>
                          <p className="text-xs text-muted-foreground/60">
                            {new URL(SITE_URL).host}/blog/{slug || '...'}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {metaDesc || 'وصف تلقائي سيظهر هنا بناءً على محتوى المقال...'}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`flex-1 flex-col min-w-0 ${isPreview ? 'hidden' : 'flex'} lg:!flex`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="flex-1 relative">
            <Textarea
              name="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="اكتب المحتوى هنا...&#10;&#10;اسحب وأفلت الصور مباشرة في المحرر."
              className="h-full w-full resize-none border-0 rounded-none p-6 focus-visible:ring-0 text-sm leading-relaxed transition-smooth"
            />
          </div>
        </div>

        <div
          className={`flex-1 flex-col min-w-0 border-l border-border/50 overflow-y-auto ${isPreview ? 'flex' : 'hidden'} lg:!flex`}
        >
          <div className="p-6 prose prose-sm dark:prose-invert max-w-none w-full prose-headings:font-bold prose-a:text-primary prose-img:rounded-xl prose-img:shadow-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {content || '*ابدأ الكتابة لرؤية المعاينة...*'}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-between border-t border-border/50 px-4 py-2.5 bg-background/80 backdrop-blur-sm"
        role="status"
        aria-label="إحصائيات المقال"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-smooth ${
              post.status === 'published'
                ? 'bg-success/10 text-success dark:bg-success/20 dark:text-success'
                : 'bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning'
            }`}
          >
            {post.status === 'published' ? 'منشور' : 'مسودة'}
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {wordCount.toLocaleString('ar')} كلمة
          </span>
          <span className="text-muted-foreground/40 hidden sm:inline">·</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {readingTimeMinutes} دقائق قراءة
          </span>
          {lastSaved && (
            <>
              <span className="text-muted-foreground/40 hidden sm:inline">·</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                حُفظ {lastSaved.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => handleSave()}
            className="transition-smooth min-h-[44px]"
          >
            {pending ? (
              <>
                <Loader2 className="ms-1.5 size-3.5 animate-spin" />
                جارٍ الحفظ...
              </>
            ) : (
              'حفظ'
            )}
          </Button>
          {post.status === 'draft' && (
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={pending}
              className="transition-smooth shadow-sm hover:shadow-md min-h-[44px]"
            >
              {pending ? (
                <>
                  <Loader2 className="ms-1.5 size-3.5 animate-spin" />
                  جارٍ النشر...
                </>
              ) : (
                'نشر'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
