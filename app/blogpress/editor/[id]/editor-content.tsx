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
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { ArrowRight, Loader2, Check, X, Save, Send, Upload, Focus, PanelRight } from 'lucide-react';
import { updatePost, saveAndPublishPost } from '@/frontend/api/blogpress';
import { toast } from 'sonner';
import TiptapEditor, { TiptapEditorRef } from './tiptap-editor';
import type { Post } from '@/shared/contracts/blogpress';
import { estimateWordCount, formatReadingTimeLong } from '@/frontend/shared/reading-time';
import { estimateContentStats } from '@/frontend/shared/blogpress/content-stats';
import { usePostAutosave } from '@/frontend/state/blogpress/use-post-autosave';
import { usePostUpload } from '@/frontend/state/blogpress/use-post-upload';
import { EditorToolbar } from '@/frontend/ui/blogpress/editor-toolbar';
import { PostSettingsDialog } from '@/frontend/ui/blogpress/post-settings-dialog';
import { EditorSidePanel } from '@/frontend/ui/blogpress/editor-side-panel';

interface EditorContentProps {
  post: Post;
}

export function EditorContent({ post }: EditorContentProps) {
  const router = useRouter();
  const editorRef = useRef<TiptapEditorRef>(null);
  const {
    title,
    setTitle,
    content,
    setContent,
    slug,
    setSlug,
    coverImage,
    setCoverImage,
    metaTitle,
    setMetaTitle,
    metaDesc,
    setMetaDesc,
    isDirty,
    lastSaved,
    isSaving,
    saveAllFields,
    markSaved,
  } = usePostAutosave(post);
  const {
    isUploading,
    isCoverUploading,
    coverImageError,
    setCoverImageError,
    fileInputRef,
    coverFileInputRef,
    handleImageUpload,
    handleFileSelect,
    handleCoverFileSelect,
  } = usePostUpload({
    onImageInserted: (url, fileName) => editorRef.current?.insertImage(url, fileName),
    onCoverChange: setCoverImage,
  });
  const [pending, startTransition] = useTransition();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [distractionFree, setDistractionFree] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [, forceRender] = useReducer((x) => x + 1, 0);

  const wordCount = useMemo(() => estimateWordCount(content), [content]);
  const contentStats = useMemo(() => estimateContentStats(content), [content]);

  const readingTimeMinutes = useMemo(
    () => formatReadingTimeLong(Math.ceil(wordCount / 180)),
    [wordCount]
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
    const fields = {
      title,
      slug: finalSlug,
      content: currentContent,
      cover_image: coverImage,
      meta_title: metaTitle,
      meta_desc: metaDesc,
    };
    startTransition(async () => {
      try {
        const result = await updatePost(post.id, fields);
        if (result?.message === 'تمَّ حفظ المقال') {
          markSaved();
          toast.success('تمَّ حفظ المقال');
        } else if (result?.errors) {
          toast.error('خطأ في التَّحقُّق من البيانات');
        }
      } catch {
        toast.error('حدث خطأ في الحفظ');
      }
    });
  }, [
    post.id,
    title,
    slug,
    setSlug,
    content,
    coverImage,
    metaTitle,
    metaDesc,
    generateSlug,
    markSaved,
  ]);

  const handleTitleBlur = useCallback(() => {
    if (slug === '' || slug.startsWith('post-')) return;
    if (title && slug === generateSlug(title)) setSlug(generateSlug(title));
  }, [title, slug, setSlug, generateSlug]);

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
    const fields = {
      title,
      slug: finalSlug,
      content: currentContent,
      cover_image: coverImage,
      meta_title: metaTitle,
      meta_desc: metaDesc,
    };
    startTransition(async () => {
      try {
        const result = await saveAndPublishPost(post.id, fields);
        if (result?.errors) {
          toast.error('يُرجَى إصلاح أخطاء التَّحقُّق قبل النَّشر');
          return;
        }
        markSaved();
        setPublishDialogOpen(false);
        toast.success('تمَّ نشر المقال!');
        router.push(`/blog/${finalSlug}`);
      } catch {
        toast.error('فشل نشر المقال. حاول مرَّة أخرى.');
      }
    });
  }, [
    post.id,
    title,
    slug,
    setSlug,
    content,
    coverImage,
    metaTitle,
    metaDesc,
    generateSlug,
    router,
    markSaved,
  ]);

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
      if (e.key === 'Escape' && distractionFree) {
        setDistractionFree(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pending, handleSave, handlePublish, post.status, distractionFree]);

  const publishChecks = getPublishChecks();

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={async () => {
              await saveAllFields();
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
          {!distractionFree && (
            <>
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
                {isUploading ? 'جارٍ الرَّفع...' : 'صورة'}
              </Button>
              <PostSettingsDialog
                title={title}
                slug={slug}
                onSlugChange={(value) => setSlug(generateSlug(value))}
                coverImage={coverImage}
                setCoverImage={setCoverImage}
                coverImageError={coverImageError}
                setCoverImageError={setCoverImageError}
                isCoverUploading={isCoverUploading}
                coverFileInputRef={coverFileInputRef}
                handleCoverFileSelect={handleCoverFileSelect}
                metaTitle={metaTitle}
                setMetaTitle={setMetaTitle}
                metaDesc={metaDesc}
                setMetaDesc={setMetaDesc}
              />
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidePanelOpen((v) => !v)}
            aria-label={sidePanelOpen ? 'إغلاق اللوحة الجانبيَّة' : 'فتح اللوحة الجانبيَّة'}
            title={sidePanelOpen ? 'إغلاق اللوحة الجانبيَّة' : 'اللوحة الجانبيَّة (SEO والإحصاءات)'}
            className={`text-muted-foreground hover:text-foreground transition-smooth shrink-0 ${
              sidePanelOpen ? 'bg-muted text-foreground' : ''
            }`}
          >
            <PanelRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDistractionFree((v) => !v)}
            aria-label={distractionFree ? 'الخروج من وضع التركيز' : 'وضع التركيز'}
            title={distractionFree ? 'الخروج من وضع التركيز' : 'وضع التركيز'}
            className="text-muted-foreground hover:text-foreground transition-smooth shrink-0"
          >
            <Focus className="size-4" />
          </Button>
        </div>
      </div>

      {!distractionFree && (
        <EditorToolbar
          editorRef={editorRef}
          fileInputRef={fileInputRef}
          onOpenLink={(href) => {
            setLinkUrl(href);
            setLinkDialogOpen(true);
          }}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          stats={contentStats}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`flex flex-1 overflow-hidden ${
            distractionFree ? 'px-0 py-2' : 'px-4 md:px-8 lg:px-12'
          }`}
        >
          <div
            className={`flex-1 mx-auto bg-background rounded-2xl shadow-xs border border-border/30 overflow-hidden my-4 md:my-6 ${
              distractionFree ? 'max-w-4xl' : 'max-w-3xl'
            }`}
          >
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

        {!distractionFree && (
          <EditorSidePanel
            open={sidePanelOpen}
            onClose={() => setSidePanelOpen(false)}
            title={title}
            slug={slug}
            metaTitle={metaTitle}
            setMetaTitle={setMetaTitle}
            metaDesc={metaDesc}
            setMetaDesc={setMetaDesc}
            stats={contentStats}
          />
        )}
      </div>

      {!distractionFree && (
        <div
          className="flex items-center justify-between border-t border-border/50 px-4 py-2.5 bg-background/80 backdrop-blur-sm"
          role="status"
          aria-label="إحصائيَّات المقال"
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
                {post.status === 'published' ? 'منشور' : 'مسودَّة'}
              </span>
              <span
                className={`size-2 rounded-full transition-smooth ${isDirty ? 'bg-warning' : 'bg-success'}`}
              />
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {isSaving ? 'جارٍ الحفظ...' : isDirty ? 'تغييرات غير محفوظة' : 'تمَّ الحفظ'}
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
                  آخر حفظ{' '}
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
              {pending || isSaving ? (
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
                    <Loader2 className="ms-1.5 size-3.5 animate-spin" /> جارٍ النَّشر...
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
      )}

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
            <DialogDescription>استخدم هذه الاختصارات لتسريع عمليَّة التَّحرير</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              { keys: 'Ctrl + S', label: 'حفظ المقال' },
              { keys: 'Ctrl + Enter', label: 'نشر المقال (للمسودَّات)' },
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
              اسحب وأفلت الصُّور مباشرةً في المحرِّر لرفعها تلقائيّاً
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pre-publish Checklist Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>التَّحقُّق قبل النَّشر</DialogTitle>
            <DialogDescription>يُرجَى مراجعة العناصر التَّالية قبل نشر المقال</DialogDescription>
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
              نشر على أيِّ حال
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
