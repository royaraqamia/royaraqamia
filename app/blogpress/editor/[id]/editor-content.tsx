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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  Code2,
  TextQuote,
  HelpCircle,
  ImagePlus,
  Link,
  Check,
  X,
  Save,
  Send,
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
  const [isDirty, setIsDirty] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const contentRef = useRef(content);
  const titleRef = useRef(title);
  const slugRef = useRef(slug);
  const coverImageRef = useRef(coverImage);
  const metaTitleRef = useRef(metaTitle);
  const metaDescRef = useRef(metaDesc);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);

  const wordCount = useMemo(() => {
    const text = content.replace(/[#*_`~>[\]!|-]/g, '').trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }, [content]);

  const readingTimeMinutes = useMemo(() => {
    return Math.max(1, Math.ceil(wordCount / 180));
  }, [wordCount]);

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
      if (result?.message === 'تم حفظ المقال') {
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

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.url) {
      const markdown = `![${file.name}](${result.url})`;
      const ta = textareaRef.current;
      if (ta && document.activeElement === ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const cur = contentRef.current;
        const newContent = cur.substring(0, start) + markdown + cur.substring(end);
        setContent(newContent);
        setTimeout(() => {
          ta.focus();
          ta.setSelectionRange(start + markdown.length, start + markdown.length);
        }, 0);
      } else {
        setContent((prev) => prev + (prev ? '\n\n' : '') + markdown);
      }
      toast.success('تم رفع الصورة');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleImageUpload(file);
    },
    [handleImageUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImageUpload(file);
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

  const insertMarkdown = useCallback(
    (action: 'bold' | 'italic' | 'h2' | 'h3' | 'link' | 'image' | 'list' | 'code' | 'quote') => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const cur = contentRef.current;
      const selected = cur.substring(start, end);
      let newContent = cur;
      let cursorPos = start;

      switch (action) {
        case 'bold': {
          const w = '**';
          newContent = cur.substring(0, start) + w + (selected || 'نص') + w + cur.substring(end);
          cursorPos = start + w.length + (selected || 'نص').length + w.length;
          break;
        }
        case 'italic': {
          const w = '*';
          newContent = cur.substring(0, start) + w + (selected || 'نص') + w + cur.substring(end);
          cursorPos = start + w.length + (selected || 'نص').length + w.length;
          break;
        }
        case 'h2': {
          const ls = cur.lastIndexOf('\n', start - 1) + 1;
          newContent = cur.substring(0, ls) + '## ' + cur.substring(ls);
          cursorPos = start + 3;
          break;
        }
        case 'h3': {
          const ls = cur.lastIndexOf('\n', start - 1) + 1;
          newContent = cur.substring(0, ls) + '### ' + cur.substring(ls);
          cursorPos = start + 4;
          break;
        }
        case 'link': {
          const s = selected ? `[${selected}](url)` : '[نص الرابط](url)';
          newContent = cur.substring(0, start) + s + cur.substring(end);
          cursorPos = start + s.length;
          break;
        }
        case 'image': {
          fileInputRef.current?.click();
          return;
        }
        case 'list': {
          const ls = cur.lastIndexOf('\n', start - 1) + 1;
          newContent = cur.substring(0, ls) + '- ' + cur.substring(ls);
          cursorPos = start + 2;
          break;
        }
        case 'code': {
          const w = '```\n';
          const we = '\n```';
          if (selected) {
            newContent = cur.substring(0, start) + w + selected + we + cur.substring(end);
            cursorPos = end + w.length + we.length;
          } else {
            newContent = cur.substring(0, start) + w + 'كود' + we + cur.substring(end);
            cursorPos = start + w.length + 2 + we.length;
          }
          break;
        }
        case 'quote': {
          const ls = cur.lastIndexOf('\n', start - 1) + 1;
          newContent = cur.substring(0, ls) + '> ' + cur.substring(ls);
          cursorPos = start + 2;
          break;
        }
      }
      setContent(newContent);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    []
  );

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
        setIsDirty(false);
        setLastSaved(new Date());
        toast.success('تم حفظ المقال');
      } else if (result?.errors) {
        toast.error('خطأ في التحقق من البيانات');
      }
    });
  }, [post.id, title, slug, content, coverImage, metaTitle, metaDesc, generateSlug]);

  const handleTitleBlur = useCallback(() => {
    if (title && (slug === '' || slug.startsWith('بدون-عنوان-'))) setSlug(generateSlug(title));
  }, [title, slug, generateSlug]);

  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      saveAllFields();
    }, 1000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [saveAllFields]);

  const getPublishChecks = useCallback(
    () => [
      { label: 'عنوان المقال', passed: title.trim().length > 0 },
      { label: 'محتوى المقال (أكثر من 50 كلمة)', passed: wordCount > 50 },
      { label: 'رابط URL (Slug)', passed: !slug.startsWith('بدون-عنوان-') && slug.length > 0 },
      { label: 'صورة الغلاف', passed: coverImage.length > 0, optional: true },
      { label: 'وصف SEO', passed: metaDesc.length > 0, optional: true },
    ],
    [title, wordCount, slug, coverImage, metaDesc]
  );

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
      setIsDirty(false);
      setPublishDialogOpen(false);
      toast.success('تم نشر المقال!');
      router.refresh();
      router.push(`/blog/${finalSlug}`);
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        insertMarkdown('bold');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        insertMarkdown('italic');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        insertMarkdown('link');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pending, handleSave, handlePublish, post.status, insertMarkdown]);

  const publishChecks = getPublishChecks();

  const toolbarButtons: {
    action: string;
    icon: React.ElementType;
    label: string;
    shortcut?: string;
  }[] = [
    { action: 'bold', icon: Bold, label: 'عريض', shortcut: 'Ctrl+B' },
    { action: 'italic', icon: Italic, label: 'مائل', shortcut: 'Ctrl+I' },
    { action: 'h2', icon: Heading2, label: 'عنوان 2' },
    { action: 'h3', icon: Heading3, label: 'عنوان 3' },
    { action: 'link', icon: Link, label: 'رابط', shortcut: 'Ctrl+K' },
    { action: 'image', icon: ImagePlus, label: 'صورة' },
    { action: 'list', icon: List, label: 'قائمة' },
    { action: 'code', icon: Code2, label: 'كود' },
    { action: 'quote', icon: TextQuote, label: 'اقتباس' },
    { action: 'shortcuts', icon: HelpCircle, label: 'اختصارات' },
  ];

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

      {!isPreview && (
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border/50 bg-muted/30 overflow-x-auto scrollbar-hide">
          {toolbarButtons.map((btn) => {
            if (btn.action === 'shortcuts') {
              return (
                <button
                  key={btn.action}
                  onClick={() => setShortcutsOpen(true)}
                  className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0 cursor-pointer"
                  aria-label={btn.label}
                  title={btn.label}
                >
                  <btn.icon className="size-4" />
                </button>
              );
            }
            return (
              <button
                key={btn.action}
                onClick={() => insertMarkdown(btn.action as any)}
                className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0 cursor-pointer"
                aria-label={btn.label}
                title={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
              >
                <btn.icon className="size-4" />
              </button>
            );
          })}
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground/50">
            <kbd className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-mono">Ctrl+S</kbd>
            <span>حفظ</span>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`flex-1 flex-col min-w-0 ${isPreview ? 'hidden' : 'flex'} lg:!flex`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
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
              {post.status === 'published' ? 'منشور' : 'مسودة'}
            </span>
            <span
              className={`size-2 rounded-full transition-smooth ${isDirty ? 'bg-warning' : 'bg-success'}`}
            />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {isDirty ? 'تغييرات غير محفوظة' : 'تم الحفظ'}
            </span>
          </div>
          <span className="text-muted-foreground/40 hidden sm:inline">·</span>
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
            className="transition-smooth min-h-[44px] rounded-xl"
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
              className="transition-smooth shadow-sm hover:shadow-md min-h-[44px] rounded-xl"
            >
              {pending ? (
                <>
                  <Loader2 className="ms-1.5 size-3.5 animate-spin" /> جارٍ النشر...
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

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اختصارات لوحة المفاتيح</DialogTitle>
            <DialogDescription>استخدم هذه الاختصارات لتسريع عملية التحرير</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              { keys: 'Ctrl + S', label: 'حفظ المقال' },
              { keys: 'Ctrl + Enter', label: 'نشر المقال (للمسودات)' },
              { keys: 'Ctrl + B', label: 'عريض' },
              { keys: 'Ctrl + I', label: 'مائل' },
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
              اسحب وأفلت الصور مباشرة في المحرر لرفعها تلقائياً
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pre-publish Checklist Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>التحقق قبل النشر</DialogTitle>
            <DialogDescription>يرجى مراجعة العناصر التالية قبل نشر المقال</DialogDescription>
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
                      <span className="text-xs text-muted-foreground/50 mr-1">(اختياري)</span>
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
              className="rounded-xl"
            >
              العودة للتحرير
            </Button>
            <Button onClick={handlePublishAnyway} className="rounded-xl">
              نشر على أي حال
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
