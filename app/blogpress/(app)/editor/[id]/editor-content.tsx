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
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { Input } from '@/frontend/ui/primitives/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import {
  ArrowRight,
  Loader2,
  Check,
  X,
  Save,
  Send,
  Upload,
  Focus,
  PanelRight,
  CloudOff,
} from 'lucide-react';
import { saveAndPublishPost, setPostTags, createTag } from '@/frontend/api/blogpress';
import { toast } from 'sonner';
import TiptapEditor, { TiptapEditorRef } from './tiptap-editor';
import type { Post, PostTag } from '@/shared/contracts/blogpress';
import { SyncStatusPill } from '@/frontend/ui/shared/sync-status-pill';
import { useBlogpressStore } from '@/frontend/state/blogpress/use-blogpress-store';
import { postExcerpt } from '@/shared/reading-time';
import { estimateWordCount, formatReadingTimeLong } from '@/frontend/shared/reading-time';
import { estimateContentStats } from '@/frontend/shared/blogpress/content-stats';
import { usePostAutosave } from '@/frontend/state/blogpress/use-post-autosave';
import { usePostUpload } from '@/frontend/state/blogpress/use-post-upload';
import { EditorToolbar } from '@/frontend/ui/blogpress/editor-toolbar';
import { PostSettingsDialog } from '@/frontend/ui/blogpress/post-settings-dialog';
import { EditorSidePanel } from '@/frontend/ui/blogpress/editor-side-panel';
import { PostActionsMenu } from '@/frontend/ui/blogpress/post-actions-menu';
import { EditorReadingProgress } from '@/frontend/ui/blogpress/editor-reading-progress';

interface EditorContentProps {
  post: Post;
  userId: string;
  availableTags: PostTag[];
  initialPostTags: PostTag[];
}

export function EditorContent({
  post,
  userId,
  availableTags,
  initialPostTags,
}: EditorContentProps) {
  const router = useRouter();
  const editorRef = useRef<TiptapEditorRef>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const { store, ready, draft, sync } = useBlogpressStore(post, userId);
  // Object URLs created for offline blobs this session, so a save can persist
  // the durable `blogpress-media:<id>` placeholder instead of a dead blob URL.
  const mediaMapRef = useRef(new Map<string, string>());
  const toStored = useCallback((value: string): string => {
    let result = value;
    for (const [objectUrl, placeholder] of mediaMapRef.current) {
      result = result.split(objectUrl).join(placeholder);
    }
    return result;
  }, []);
  const persist = useCallback(
    async (fields: {
      slug: string;
      content: string;
      cover_image: string;
      meta_title: string;
      meta_desc: string;
    }): Promise<boolean> => {
      if (!store) return false;
      await store.saveDraft({
        id: post.id,
        clientId: draft?.clientId ?? post.id,
        slug: fields.slug,
        content: toStored(fields.content),
        coverImage: toStored(fields.cover_image),
        metaTitle: fields.meta_title,
        metaDesc: fields.meta_desc,
        status: post.status,
        isNew: draft?.isNew ?? false,
      });
      return true;
    },
    [store, post.id, post.status, draft?.clientId, draft?.isNew, toStored]
  );
  const {
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
  } = usePostAutosave(post, persist);
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
    store,
    postId: post.id,
    onMediaStored: (objectUrl, placeholder) => mediaMapRef.current.set(objectUrl, placeholder),
  });
  const [pending, startTransition] = useTransition();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [distractionFree, setDistractionFree] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [availableTagList, setAvailableTagList] = useState<PostTag[]>(availableTags);
  const [selectedTags, setSelectedTags] = useState<PostTag[]>(initialPostTags);
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

  const excerpt = useMemo(() => postExcerpt(content, metaDesc), [content, metaDesc]);

  const fallbackSlug = useCallback(
    () => `post-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 8)}`,
    []
  );

  const resolveSlug = useCallback(
    (candidate: string) => generateSlug(candidate) || fallbackSlug(),
    [generateSlug, fallbackSlug]
  );

  const handleSave = useCallback(async () => {
    const finalSlug = resolveSlug(slug);
    if (finalSlug !== slug) setSlug(finalSlug);
    const currentContent = editorRef.current?.getMarkdown() ?? content;
    const fields = {
      slug: finalSlug,
      content: currentContent,
      cover_image: coverImage,
      meta_title: metaTitle,
      meta_desc: metaDesc,
    };
    startTransition(async () => {
      try {
        const saved = await persist(fields);
        if (saved) {
          markSaved();
          toast.success('تمَّ حفظ المنشور');
        } else {
          toast.error('حدث خطأ في الحفظ');
        }
      } catch {
        toast.error('حدث خطأ في الحفظ');
      }
    });
  }, [slug, setSlug, content, coverImage, metaTitle, metaDesc, resolveSlug, markSaved, persist]);

  const persistPostTags = useCallback(
    (next: PostTag[]) => {
      setSelectedTags(next);
      setPostTags(
        post.id,
        next.map((t) => t.id)
      ).catch(() => {
        toast.error('فشل حفظ الوسوم');
      });
    },
    [post.id]
  );

  const handleToggleTag = useCallback(
    (tag: PostTag) => {
      const selectedIds = new Set(selectedTags.map((t) => t.id));
      const next = selectedIds.has(tag.id)
        ? selectedTags.filter((t) => t.id !== tag.id)
        : [...selectedTags, tag];
      persistPostTags(next);
    },
    [selectedTags, persistPostTags]
  );

  const handleCreateTag = useCallback(
    async (name: string, slug: string): Promise<PostTag | null> => {
      const result = await createTag({ name, slug });
      if ('errors' in result && result.errors) {
        toast.error('فشل إنشاء الوسم');
        return null;
      }
      if ('tag' in result) {
        setAvailableTagList((prev) =>
          prev.some((t) => t.id === result.tag.id) ? prev : [...prev, result.tag]
        );
        return result.tag;
      }
      return null;
    },
    []
  );

  const getPublishChecks = useCallback(
    () => [
      { label: 'محتوى المنشور (أكثر من 50 كلمة)', passed: wordCount > 50 },
      {
        label: 'رابط URL (Slug)',
        passed: slug.length > 0 && !slug.startsWith('post-'),
        optional: true,
      },
      { label: 'صورة الغلاف', passed: coverImage.length > 0, optional: true },
      { label: 'وصف SEO', passed: metaDesc.length > 0, optional: true },
    ],
    [wordCount, slug, coverImage, metaDesc]
  );

  const handlePublish = useCallback(async () => {
    // Publishing is inherently online-only (ADR-0031): the shared Community feed
    // is server-authoritative, so there is no offline publish to queue.
    if (!sync.online) {
      toast.error('يتطلَّب النَّشر اتصالاً بالإنترنت');
      return;
    }
    const finalSlug = resolveSlug(slug);
    if (finalSlug !== slug) setSlug(finalSlug);
    const currentContent = toStored(editorRef.current?.getMarkdown() ?? content);
    const fields = {
      slug: finalSlug,
      content: currentContent,
      cover_image: toStored(coverImage),
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
        toast.success('تمَّ نشر المنشور!');
        router.push(`/community/${finalSlug}`);
      } catch {
        toast.error('فشل نشر المنشور. حاول مرَّة أخرى.');
      }
    });
  }, [
    sync.online,
    post.id,
    slug,
    setSlug,
    content,
    coverImage,
    metaTitle,
    metaDesc,
    resolveSlug,
    router,
    markSaved,
    toStored,
  ]);

  const handlePublishClick = useCallback(() => {
    if (!sync.online) {
      toast.error('يتطلَّب النَّشر اتصالاً بالإنترنت');
      return;
    }
    const checks = getPublishChecks();
    const failed = checks.filter((c) => !c.passed && !c.optional);
    if (failed.length > 0) setPublishDialogOpen(true);
    else handlePublish();
  }, [getPublishChecks, handlePublish, sync.online]);

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
    <div className="flex h-dvh flex-col" data-blogpress-ready={ready ? 'true' : 'false'}>
      <EditorReadingProgress scrollContainerRef={editorContainerRef} />
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 bg-background/80">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={async () => {
              await saveAllFields();
              router.push('/blogpress');
            }}
            className="shrink-0 transition-smooth"
            aria-label="العودة إلى لوحة التحكم"
          >
            <ArrowRight className="size-4" />
          </Button>
          <span className="truncate text-sm font-bold text-muted-foreground">تحرير المنشور</span>
          <SyncStatusPill status={sync} />
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
                {isUploading ? 'جاري الرَّفع...' : 'صورة'}
              </Button>
              <PostSettingsDialog
                excerpt={excerpt}
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
          <PostActionsMenu
            postId={post.id}
            excerpt={excerpt}
            getMarkdown={() => editorRef.current?.getMarkdown() ?? content}
            onDuplicated={(newId) => router.push(`/blogpress/editor/${newId}`)}
          />
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
            ref={editorContainerRef}
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
            excerpt={excerpt}
            slug={slug}
            metaTitle={metaTitle}
            setMetaTitle={setMetaTitle}
            metaDesc={metaDesc}
            setMetaDesc={setMetaDesc}
            stats={contentStats}
            availableTags={availableTagList}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
            onCreateTag={handleCreateTag}
          />
        )}
      </div>

      {!distractionFree && (
        <div
          className="flex items-center justify-between border-t border-border/50 px-4 py-2.5 bg-background/80"
          role="status"
          aria-label="إحصائيَّات المنشور"
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
                  className={`size-1.5 rounded-full ${post.status === 'published' ? 'bg-success' : 'bg-warning'}`}
                />
                {post.status === 'published' ? 'منشور' : 'مسودَّة'}
              </span>
              <span
                className={`size-2 rounded-full transition-smooth ${isDirty ? 'bg-warning' : 'bg-success'}`}
              />
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {isSaving ? 'جاري الحفظ...' : isDirty ? 'تغييرات غير محفوظة' : 'تمَّ الحفظ'}
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
            {!sync.online && post.status === 'draft' && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-bold text-warning"
              >
                <CloudOff className="size-3.5" />
                النَّشر يتطلَّب اتصالاً
              </span>
            )}
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
                  <Loader2 className="ms-1.5 size-3.5 animate-spin" /> جاري الحفظ...
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
                disabled={pending || !sync.online}
                title={sync.online ? undefined : 'يتطلَّب النَّشر اتصالاً بالإنترنت'}
                className="transition-smooth shadow-sm hover:shadow-md min-h-11 rounded-full"
              >
                {pending ? (
                  <>
                    <Loader2 className="ms-1.5 size-3.5 animate-spin" /> جاري النَّشر...
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
            <DialogActions onCancel={() => setLinkDialogOpen(false)} className="pt-0">
              <HeroCtaButton
                type="button"
                onClick={() => {
                  const ed = editorRef.current?.editor;
                  if (ed && linkUrl) {
                    ed.chain().focus().setLink({ href: linkUrl }).run();
                  }
                  setLinkDialogOpen(false);
                }}
                className="w-full sm:w-auto"
              >
                إدراج
              </HeroCtaButton>
            </DialogActions>
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
              { keys: 'Ctrl + S', label: 'حفظ المنشور' },
              { keys: 'Ctrl + Enter', label: 'نشر المنشور (للمسودَّات)' },
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
            <DialogDescription>يُرجَى مراجعة العناصر التَّالية قبل نشر المنشور</DialogDescription>
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
          <DialogActions
            onCancel={() => setPublishDialogOpen(false)}
            cancelLabel="العودة للتحرير"
            className="pt-2"
          >
            <HeroCtaButton type="button" onClick={handlePublishAnyway} className="w-full sm:w-auto">
              نشر على أيِّ حال
            </HeroCtaButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
