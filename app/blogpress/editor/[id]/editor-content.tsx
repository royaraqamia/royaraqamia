'use client';

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useTransition,
  useMemo,
  useReducer,
} from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/frontend/ui/ui/button';
import { Input } from '@/frontend/ui/ui/input';
import { Label } from '@/frontend/ui/ui/label';
import { Textarea } from '@/frontend/ui/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/ui/ui/dialog';
import {
  Settings,
  Upload,
  ArrowRight,
  Loader2,
  ImageIcon,
  Link2,
  Search,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code2,
  TextQuote,
  Strikethrough,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  HelpCircle,
  ImagePlus,
  Link,
  Check,
  X,
  Save,
  Send,
} from 'lucide-react';
import { updatePost, saveAndPublishPost } from '@/backend/controllers/blogpress/posts';
import { uploadImage } from '@/backend/controllers/blogpress/media';
import { toast } from 'sonner';
import TiptapEditor, { TiptapEditorRef } from './tiptap-editor';
import type { Post } from '@/shared/contracts/blogpress';
import { estimateWordCount, formatReadingTimeLong } from '@/backend/shared/reading-time';

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
  const [isUploading, setIsUploading] = useState(false);
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [coverImageError, setCoverImageError] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();
  const [isDirty, setIsDirty] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [, forceRender] = useReducer((x) => x + 1, 0);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const contentRef = useRef(content);
  const titleRef = useRef(title);
  const slugRef = useRef(slug);
  const coverImageRef = useRef(coverImage);
  const metaTitleRef = useRef(metaTitle);
  const metaDescRef = useRef(metaDesc);
  const editorRef = useRef<TiptapEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);

  const wordCount = useMemo(() => estimateWordCount(content), [content]);

  const readingTimeMinutes = useMemo(
    () => formatReadingTimeLong(Math.ceil(wordCount / 180)),
    [wordCount]
  );

  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    slugRef.current = slug;
  }, [slug]);
  useEffect(() => {
    coverImageRef.current = coverImage;
  }, [coverImage]);
  useEffect(() => {
    metaTitleRef.current = metaTitle;
  }, [metaTitle]);
  useEffect(() => {
    metaDescRef.current = metaDesc;
  }, [metaDesc]);

  useEffect(() => {
    isDirtyRef.current = true;
    setIsDirty(true);
  }, [title, content, slug, coverImage, metaTitle, metaDesc]);

  const saveAllFields = useCallback(async () => {
    if (!isDirtyRef.current) return;
    const formData = new FormData();
    formData.append('title', titleRef.current);
    formData.append('slug', slugRef.current);
    formData.append('content', contentRef.current);
    formData.append('cover_image', coverImageRef.current);
    formData.append('meta_title', metaTitleRef.current);
    formData.append('meta_desc', metaDescRef.current);
    try {
      const result = await updatePost(post.id, undefined, formData);
      if (result?.message === 'تمَّ حفظ المقال') {
        isDirtyRef.current = false;
        setIsDirty(false);
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

    if ('error' in result && result.error) {
      toast.error(result.error);
      return;
    }

    if ('url' in result && result.url) {
      editorRef.current?.insertImage(result.url, file.name);
      toast.success('تمَّ رفع الصُّورة');
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImageUpload(file);
      e.target.value = '';
    },
    [handleImageUpload]
  );

  const handleCoverUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('يجب أن يكون الملف صورة');
      return;
    }
    setIsCoverUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await uploadImage(formData);
      if ('error' in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ('url' in result && result.url) {
        setCoverImage(result.url);
        setCoverImageError(false);
        toast.success('تمَّ رفع صورة الغلاف');
      }
    } catch {
      toast.error('فشل رفع الصورة');
    } finally {
      setIsCoverUploading(false);
    }
  }, []);

  const handleCoverFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleCoverUpload(file);
      e.target.value = '';
    },
    [handleCoverUpload]
  );

  const generateSlug = useCallback((text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF-]/g, '')
      .replace(/[\u060C\u061B\u061F\u0640\u066A\u066B\u066C\u066D\u06D4]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 200);
  }, []);

  const handleSave = useCallback(async () => {
    let finalSlug = generateSlug(slug);
    if (!finalSlug) {
      finalSlug =
        generateSlug(title) ||
        `post-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 8)}`;
    }
    if (finalSlug !== slug) setSlug(finalSlug);
    const currentContent = editorRef.current?.getMarkdown() ?? content;
    const formData = new FormData();
    formData.append('title', title);
    formData.append('slug', finalSlug);
    formData.append('content', currentContent);
    formData.append('cover_image', coverImage);
    formData.append('meta_title', metaTitle);
    formData.append('meta_desc', metaDesc);
    startTransition(async () => {
      try {
        const result = await updatePost(post.id, undefined, formData);
        if (result?.message === 'تمَّ حفظ المقال') {
          isDirtyRef.current = false;
          setIsDirty(false);
          setLastSaved(new Date());
          toast.success('تمَّ حفظ المقال');
        } else if (result?.errors) {
          toast.error('خطأ في التَّحقُّق من البيانات');
        }
      } catch {
        toast.error('حدث خطأ في الحفظ');
      }
    });
  }, [post.id, title, slug, content, coverImage, metaTitle, metaDesc, generateSlug]);

  const handleTitleBlur = useCallback(() => {
    if (slug === '' || slug.startsWith('post-')) return;
    if (title && slug === generateSlug(title)) setSlug(generateSlug(title));
  }, [title, slug, generateSlug]);

  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      saveAllFields();
    }, 30000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [saveAllFields]);

  const getPublishChecks = useCallback(
    () => [
      { label: 'عنوان المقال', passed: title.trim().length > 0 },
      { label: 'محتوى المقال (أكثر من 50 كلمة)', passed: wordCount > 50 },
      {
        label: 'رابط URL (Slug)',
        passed: slug.length > 0 && !slug.startsWith('post-'),
        optional: true,
      },
      { label: 'صورة الغلاف', passed: coverImage.length > 0, optional: true },
      { label: 'وصف SEO', passed: metaDesc.length > 0, optional: true },
    ],
    [title, wordCount, slug, coverImage, metaDesc]
  );

  const handlePublish = useCallback(async () => {
    let finalSlug = generateSlug(slug);
    if (!finalSlug) {
      finalSlug =
        generateSlug(title) ||
        `post-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 8)}`;
    }
    if (finalSlug !== slug) setSlug(finalSlug);
    const currentContent = editorRef.current?.getMarkdown() ?? content;
    const formData = new FormData();
    formData.append('title', title);
    formData.append('slug', finalSlug);
    formData.append('content', currentContent);
    formData.append('cover_image', coverImage);
    formData.append('meta_title', metaTitle);
    formData.append('meta_desc', metaDesc);
    startTransition(async () => {
      try {
        const result = await saveAndPublishPost(post.id, formData);
        if (result?.errors) {
          toast.error('يُرجَى إصلاح أخطاء التَّحقُّق قبل النَّشر');
          return;
        }
        isDirtyRef.current = false;
        setIsDirty(false);
        setPublishDialogOpen(false);
        toast.success('تمَّ نشر المقال!');
        router.push(`/blog/${finalSlug}`);
      } catch {
        toast.error('فشل نشر المقال. حاول مرَّة أخرى.');
      }
    });
  }, [post.id, title, slug, content, coverImage, metaTitle, metaDesc, generateSlug, router]);

  const handlePublishClick = useCallback(() => {
    const checks = getPublishChecks();
    const failed = checks.filter((c) => !c.passed && !c.optional);
    if (failed.length > 0) setPublishDialogOpen(true);
    else handlePublish();
  }, [getPublishChecks, handlePublish]);

  const handlePublishAnyway = useCallback(() => {
    setPublishDialogOpen(false);
    setTimeout(() => handlePublish(), 200);
  }, [handlePublish]);

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

  const publishChecks = getPublishChecks();

  const toolbarButtons: {
    action: string;
    icon: React.ElementType;
    label: string;
    group?: string;
  }[] = [
    { action: 'undo', icon: Undo2, label: 'تراجع', group: 'history' },
    { action: 'redo', icon: Redo2, label: 'إعادة', group: 'history' },
    { action: 'bold', icon: Bold, label: 'عريض', group: 'format' },
    { action: 'italic', icon: Italic, label: 'مائل', group: 'format' },
    { action: 'strike', icon: Strikethrough, label: 'يتوسّط', group: 'format' },
    { action: 'h1', icon: Heading1, label: 'عنوان 1', group: 'heading' },
    { action: 'h2', icon: Heading2, label: 'عنوان 2', group: 'heading' },
    { action: 'h3', icon: Heading3, label: 'عنوان 3', group: 'heading' },
    { action: 'list', icon: List, label: 'قائمة نقطية', group: 'list' },
    { action: 'orderedList', icon: ListOrdered, label: 'قائمة مرقّمة', group: 'list' },
    { action: 'quote', icon: TextQuote, label: 'اقتباس', group: 'block' },
    { action: 'code', icon: Code2, label: 'كود', group: 'block' },
    { action: 'hr', icon: Minus, label: 'فاصل', group: 'insert' },
    { action: 'link', icon: Link, label: 'رابط', group: 'insert' },
    { action: 'image', icon: ImagePlus, label: 'صورة', group: 'insert' },
    { action: 'alignLeft', icon: AlignLeft, label: 'محاذاة لليسار', group: 'align' },
    { action: 'alignCenter', icon: AlignCenter, label: 'توسيط', group: 'align' },
    { action: 'alignRight', icon: AlignRight, label: 'محاذاة لليمين', group: 'align' },
    { action: 'shortcuts', icon: HelpCircle, label: 'اختصارات' },
  ];

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={async () => {
              if (isDirtyRef.current) await saveAllFields();
              router.push('/blogpress/app');
            }}
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
            className="border-0 text-lg font-semibold bg-transparent px-0 h-auto placeholder:text-muted-foreground/50 transition-smooth focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
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
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="text-muted-foreground hover:text-foreground transition-smooth inline-flex min-h-11"
          >
            {isUploading ? (
              <Loader2 className="size-4 ms-1.5 animate-spin" />
            ) : (
              <Upload className="size-4 ms-1.5" />
            )}
            {isUploading ? 'جارٍ الرَّفع...' : 'صورة'}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground transition-smooth"
                aria-label="إعدادات المقال"
              >
                <Settings className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>إعدادات المقال</DialogTitle>
                <DialogDescription>تكوين بيانات SEO وخيارات النَّشر</DialogDescription>
              </DialogHeader>
              <div className="grid gap-6">
                <div className="space-y-3 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground flex-wrap">
                    <Link2 className="size-4 text-muted-foreground" />
                    الرَّابط
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="slug" className="text-xs text-muted-foreground">
                      رابط URL
                    </Label>
                    <Input
                      id="slug"
                      name="slug"
                      value={slug}
                      onChange={(e) => setSlug(generateSlug(e.target.value))}
                      placeholder="رابط-المقال"
                      className="transition-smooth min-h-11"
                      dir="ltr"
                    />
                    <p className="text-xs text-muted-foreground truncate break-all">
                      <span className="text-muted-foreground/60">
                        {new URL(SITE_URL).host}/blog/
                      </span>
                      {slug || <span className="text-muted-foreground/40">رابط-المقال</span>}
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      أدخل رابطاً إنجليزيّاً قصيراً (مثل: my-first-post)
                    </p>
                  </div>
                </div>

                <div className="h-px bg-border/50" />

                <div className="space-y-3 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground flex-wrap">
                    <ImageIcon className="size-4 text-muted-foreground" />
                    صورة الغلاف
                  </div>
                  <div className="grid gap-2">
                    <input
                      ref={coverFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverFileSelect}
                    />
                    {coverImage && !coverImageError ? (
                      <div className="relative aspect-video overflow-hidden rounded-lg border border-border/50 bg-muted group">
                        <Image
                          src={coverImage}
                          alt="معاينة صورة الغلاف"
                          fill
                          sizes="(max-width: 640px) 100vw, 448px"
                          unoptimized
                          className="object-cover"
                          onError={() => setCoverImageError(true)}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="rounded-full"
                            disabled={isCoverUploading}
                            onClick={() => coverFileInputRef.current?.click()}
                          >
                            {isCoverUploading ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Upload className="size-3.5" />
                            )}
                            تغيير
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="rounded-full"
                            onClick={() => {
                              setCoverImage('');
                              setCoverImageError(false);
                            }}
                          >
                            <X className="size-3.5" />
                            إزالة
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => coverFileInputRef.current?.click()}
                        disabled={isCoverUploading}
                        className="flex flex-col items-center justify-center aspect-video rounded-lg border border-dashed border-border/60 bg-muted/30 hover:bg-muted/50 hover:border-primary/40 transition-smooth text-center cursor-pointer disabled:opacity-50"
                      >
                        {isCoverUploading ? (
                          <Loader2 className="size-8 text-muted-foreground/30 mb-2 animate-spin" />
                        ) : (
                          <ImageIcon className="size-8 text-muted-foreground/30 mb-2" />
                        )}
                        <p className="text-xs text-muted-foreground">
                          {isCoverUploading ? 'جارٍ الرَّفع...' : 'انقر لرفع صورة الغلاف'}
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          PNG أو JPG أو WebP. يُفضَّل أبعاد 1200×630 بكسل.
                        </p>
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-px bg-border/50" />

                <div className="space-y-3 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground flex-wrap">
                    <Search className="size-4 text-muted-foreground" />
                    تحسين محرِّكات البحث (SEO)
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed">
                    هذه البيانات تظهر في نتائج البحث وعند مشاركة المقال على وسائل التَّواصل. إذا
                    تركتها فارغة، سيتمُّ استخدام عنوان المقال ووصف تلقائي.
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
                          تمَّ الوصول للحدِّ الأقصى
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
                      className="transition-smooth resize-none min-h-22"
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
                          تمَّ الوصول للحد الأقصى
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
                          <p className="text-xs text-muted-foreground/60 truncate break-all">
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
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border/50 bg-muted/30 overflow-x-auto scrollbar-hide">
        {(() => {
          let lastGroup: string | undefined;
          const elements: React.ReactNode[] = [];
          toolbarButtons.forEach((btn) => {
            const ed = editorRef.current?.editor;
            const isActive =
              ed &&
              (btn.action === 'bold'
                ? ed.isActive('bold')
                : btn.action === 'italic'
                  ? ed.isActive('italic')
                  : btn.action === 'strike'
                    ? ed.isActive('strike')
                    : btn.action === 'h1'
                      ? ed.isActive('heading', { level: 1 })
                      : btn.action === 'h2'
                        ? ed.isActive('heading', { level: 2 })
                        : btn.action === 'h3'
                          ? ed.isActive('heading', { level: 3 })
                          : btn.action === 'list'
                            ? ed.isActive('bulletList')
                            : btn.action === 'orderedList'
                              ? ed.isActive('orderedList')
                              : btn.action === 'quote'
                                ? ed.isActive('blockquote')
                                : btn.action === 'code'
                                  ? ed.isActive('codeBlock')
                                  : btn.action === 'link'
                                    ? ed.isActive('link')
                                    : btn.action === 'alignLeft'
                                      ? ed.isActive({ textAlign: 'left' })
                                      : btn.action === 'alignCenter'
                                        ? ed.isActive({ textAlign: 'center' })
                                        : btn.action === 'alignRight'
                                          ? ed.isActive({ textAlign: 'right' })
                                          : false);

            if (btn.group && lastGroup && btn.group !== lastGroup) {
              elements.push(
                <div key={`sep-${btn.action}`} className="w-px h-5 bg-border/40 mx-1 shrink-0" />
              );
            }
            lastGroup = btn.group;

            if (btn.action === 'shortcuts') {
              elements.push(
                <button
                  key={btn.action}
                  onClick={() => setShortcutsOpen(true)}
                  className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0 cursor-pointer"
                  aria-label={btn.label}
                  title={btn.label}
                >
                  <btn.icon className="size-4" />
                </button>
              );
              return;
            }

            elements.push(
              <button
                key={btn.action}
                onClick={() => {
                  if (!ed) return;
                  if (btn.action === 'image') {
                    fileInputRef.current?.click();
                    return;
                  }
                  if (btn.action === 'link') {
                    setLinkUrl(ed.getAttributes('link').href ?? '');
                    setLinkDialogOpen(true);
                    return;
                  }
                  if (btn.action === 'undo') {
                    ed.chain().focus().undo().run();
                    return;
                  }
                  if (btn.action === 'redo') {
                    ed.chain().focus().redo().run();
                    return;
                  }
                  if (btn.action === 'h1') {
                    ed.chain().focus().toggleHeading({ level: 1 }).run();
                    return;
                  }
                  if (btn.action === 'h2') {
                    ed.chain().focus().toggleHeading({ level: 2 }).run();
                    return;
                  }
                  if (btn.action === 'h3') {
                    ed.chain().focus().toggleHeading({ level: 3 }).run();
                    return;
                  }
                  if (btn.action === 'orderedList') {
                    ed.chain().focus().toggleOrderedList().run();
                    return;
                  }
                  if (btn.action === 'hr') {
                    ed.chain().focus().setHorizontalRule().run();
                    return;
                  }
                  if (btn.action === 'alignLeft') {
                    ed.chain().focus().setTextAlign('left').run();
                    return;
                  }
                  if (btn.action === 'alignCenter') {
                    ed.chain().focus().setTextAlign('center').run();
                    return;
                  }
                  if (btn.action === 'alignRight') {
                    ed.chain().focus().setTextAlign('right').run();
                    return;
                  }
                  const actionMap: Record<string, () => void> = {
                    bold: () => ed.chain().focus().toggleBold().run(),
                    italic: () => ed.chain().focus().toggleItalic().run(),
                    strike: () => ed.chain().focus().toggleStrike().run(),
                    list: () => ed.chain().focus().toggleBulletList().run(),
                    code: () => ed.chain().focus().toggleCodeBlock().run(),
                    quote: () => ed.chain().focus().toggleBlockquote().run(),
                  };
                  actionMap[btn.action]?.();
                }}
                className={`size-8 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-primary/15 text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                aria-label={btn.label}
                title={btn.label}
              >
                <btn.icon className="size-4" />
              </button>
            );
          });
          return elements;
        })()}
        <div className="me-auto flex items-center gap-2 text-xs text-muted-foreground/50">
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-mono">Ctrl+S</kbd>
          <span>حفظ</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden px-4 md:px-8 lg:px-12">
        <div className="flex-1 max-w-3xl mx-auto bg-background rounded-2xl shadow-xs border border-border/30 overflow-hidden my-4 md:my-6">
          <TiptapEditor
            ref={editorRef}
            initialContent={content}
            onUpdate={setContent}
            onImageUpload={handleImageUpload}
            onStateChange={() => forceRender()}
            className="flex-1"
          />
        </div>
      </div>

      <div
        className="flex items-center justify-between border-t border-border/50 px-4 py-2.5 bg-background/80 backdrop-blur-sm"
        role="status"
        aria-label="إحصائيَّات المقال"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-smooth ${
                post.status === 'published'
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/10 text-warning'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${post.status === 'published' ? 'bg-success' : 'bg-warning animate-pulse'}`}
              />
              {post.status === 'published' ? 'منشور' : 'مسودَّة'}
            </span>
            <span
              className={`size-2 rounded-full transition-smooth ${isDirty ? 'bg-warning' : 'bg-success'}`}
            />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {isDirty ? 'تغييرات غير محفوظة' : 'تمَّ الحفظ'}
            </span>
          </div>
          <span className="text-muted-foreground/40 hidden sm:inline">·</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {wordCount.toLocaleString('ar-u-nu-latn')} كلمة
          </span>
          <span className="text-muted-foreground/40 hidden sm:inline">·</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {readingTimeMinutes}
          </span>
          {lastSaved && (
            <>
              <span className="text-muted-foreground/40 hidden sm:inline">·</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                حفظ{' '}
                {lastSaved.toLocaleTimeString('ar-u-nu-latn', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
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
            className="transition-smooth min-h-11 rounded-full"
          >
            {pending ? (
              <>
                <Loader2 className="ms-1.5 size-3.5 animate-spin" /> جارٍ الحفظ...
              </>
            ) : (
              <>
                <Save className="ms-1.5 size-3.5" /> حفظ
              </>
            )}
          </Button>
          {post.status === 'draft' && (
            <Button
              size="sm"
              onClick={handlePublishClick}
              disabled={pending}
              className="transition-smooth shadow-sm hover:shadow-md min-h-11 rounded-full"
            >
              {pending ? (
                <>
                  <Loader2 className="ms-1.5 size-3.5 animate-spin" /> جارٍ النَّشر...
                </>
              ) : (
                <>
                  <Send className="ms-1.5 size-3.5" /> نشر
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>إدراج رابط</DialogTitle>
            <DialogDescription>أدخل رابط URL للرابط</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              dir="ltr"
              className="min-h-11"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setLinkDialogOpen(false)}
                className="rounded-full"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => {
                  const ed = editorRef.current?.editor;
                  if (ed && linkUrl) {
                    ed.chain().focus().setLink({ href: linkUrl }).run();
                  }
                  setLinkDialogOpen(false);
                }}
                className="rounded-full"
              >
                إدراج
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اختصارات لوحة المفاتيح</DialogTitle>
            <DialogDescription>استخدم هذه الاختصارات لتسريع عمليَّة التَّحرير</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              { keys: 'Ctrl + S', label: 'حفظ المقال' },
              { keys: 'Ctrl + Enter', label: 'نشر المقال (للمسودَّات)' },
              { keys: 'Ctrl + B', label: 'عريض' },
              { keys: 'Ctrl + I', label: 'مائل' },
              { keys: 'Ctrl + Z', label: 'تراجع' },
              { keys: 'Ctrl + Shift + Z', label: 'إعادة' },
              { keys: 'Ctrl + K', label: 'إدراج رابط' },
            ].map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">{shortcut.label}</span>
                <kbd className="px-2 py-1 rounded-md bg-muted text-xs font-mono text-foreground border border-border/50">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
            <div className="h-px bg-border/50 my-2" />
            <p className="text-xs text-muted-foreground">
              اسحب وأفلت الصُّور مباشرةً في المحرِّر لرفعها تلقائيًّا
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pre-publish Checklist Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>التَّحقُّق قبل النَّشر</DialogTitle>
            <DialogDescription>يُرجَى مراجعة العناصر التَّالية قبل نشر المقال</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {publishChecks.map((check) => (
              <div key={check.label} className="flex items-center gap-3">
                <div
                  className={`size-6 rounded-full flex items-center justify-center shrink-0 ${
                    check.passed
                      ? 'bg-success/10 text-success'
                      : check.optional
                        ? 'bg-muted text-muted-foreground/50'
                        : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {check.passed ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${check.passed ? 'text-foreground' : check.optional ? 'text-muted-foreground/60' : 'text-destructive'}`}
                  >
                    {check.label}
                    {check.optional && (
                      <span className="text-xs text-muted-foreground/50 ms-1">(اختياري)</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setPublishDialogOpen(false)}
              className="rounded-full"
            >
              العودة للتحرير
            </Button>
            <Button onClick={handlePublishAnyway} className="rounded-full">
              نشر على أيِّ حال
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
