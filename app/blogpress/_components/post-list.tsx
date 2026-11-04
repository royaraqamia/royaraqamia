'use client';

import { useState, useTransition, useMemo, useRef, useEffect, memo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import {
  FileText,
  Ellipsis,
  Eye,
  EyeOff,
  Trash,
  PenLine,
  Plus,
  LoaderCircle,
  Search,
  X,
  ExternalLink,
  Clock,
  Pin,
  PinOff,
  Check,
  FolderInput,
  CopyPlus,
  FileDown,
  FileCodeCorner,
} from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/ui/primitives/dialog';
import {
  deletePost,
  unpublishPost,
  publishPost,
  setPostFeatured,
  duplicatePost,
  restorePost,
} from '@/frontend/api/blogpress';
import { createPostOrReportFailure } from './create-post';
import { downloadPostAsFile } from '@/frontend/shared/blogpress/export-post';
import { useBulkPosts } from '@/frontend/state/blogpress/use-bulk-posts';
import type { Post, PostTag, PostCategory, PostStatus } from '@/shared/contracts/blogpress';
import { postExcerpt } from '@/shared/reading-time';
import { cn } from '@/frontend/shared/cn';
import {
  estimateWordCount,
  estimateReadingTime,
  formatReadingTime,
} from '@/frontend/shared/reading-time';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { BLOGPRESS_COPY } from './blogpress-copy';

interface PostListProps {
  posts: Post[];
  categories: PostCategory[];
  activeCategory?: string;
  tagsByPost?: Record<string, PostTag[]>;
}

/** `{name}` in a copy string, replaced by the value the caller supplies. */
function fill(value: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, replacement]) => text.split(`{${key}}`).join(String(replacement)),
    value
  );
}

const filters: { label: string; value: PostStatus | 'all' }[] = [
  { label: BLOGPRESS_COPY.filterAll, value: 'all' },
  { label: BLOGPRESS_COPY.filterDraft, value: 'draft' },
  { label: BLOGPRESS_COPY.filterScheduled, value: 'scheduled' },
  { label: BLOGPRESS_COPY.filterPublished, value: 'published' },
];

/** Publishing is online-only (ADR-0031); returns false and says so when offline. */
function requireConnection(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast.error(BLOGPRESS_COPY.needsConnection);
    return false;
  }
  return true;
}

export const PostList = memo(function PostList({
  posts,
  categories,
  activeCategory,
  tagsByPost,
}: PostListProps) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<PostStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredPosts = useMemo(
    () => filterPosts(posts, activeFilter, searchQuery),
    [posts, activeFilter, searchQuery]
  );

  const bulk = useBulkPosts(filteredPosts.map((p) => p.id));
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const countByStatus = useMemo(
    () => ({
      draft: posts.filter((p) => p.status === 'draft').length,
      scheduled: posts.filter((p) => p.status === 'scheduled').length,
      published: posts.filter((p) => p.status === 'published').length,
    }),
    [posts]
  );

  const runBulkAction = async (action: 'publish' | 'unpublish' | 'delete' | 'setCategory') => {
    if ((action === 'publish' || action === 'unpublish') && !requireConnection()) return;
    const affected = await bulk.run(action, action === 'setCategory' ? categoryId : undefined);
    if (affected === null) return;
    bulk.clear();
    setCategoryOpen(false);
    setCategoryId('');
    setShowDeleteConfirm(false);
    toast.success(
      action === 'setCategory'
        ? BLOGPRESS_COPY.bulkUpdated
        : action === 'delete'
          ? fill(BLOGPRESS_COPY.bulkDeleted, { count: affected })
          : action === 'publish'
            ? fill(BLOGPRESS_COPY.bulkPublished, { count: affected })
            : fill(BLOGPRESS_COPY.bulkUnpublished, { count: affected })
    );
    router.refresh();
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {categories.length > 0 && (
        <nav
          className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar -mx-1 px-1"
          aria-label={BLOGPRESS_COPY.categoryFilterAria}
          data-visual="blogpress-categories"
        >
          <CategoryChip
            label={BLOGPRESS_COPY.categoryAll}
            slug={undefined}
            active={!activeCategory}
            onSelect={(nextSlug) =>
              router.push(`/blogpress${nextSlug ? `?category=${nextSlug}` : ''}`)
            }
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              slug={category.slug}
              active={activeCategory === category.slug}
              onSelect={(nextSlug) =>
                router.push(`/blogpress${nextSlug ? `?category=${nextSlug}` : ''}`)
              }
            />
          ))}
        </nav>
      )}

      {filteredPosts.length > 0 && (
        <BulkActionBar
          allSelected={bulk.allSelected}
          total={filteredPosts.length}
          selectedCount={bulk.selectedCount}
          busy={bulk.busy}
          onToggleAll={bulk.toggleAll}
          onClear={bulk.clear}
          onPublish={() => runBulkAction('publish')}
          onUnpublish={() => runBulkAction('unpublish')}
          onOpenDelete={() => setShowDeleteConfirm(true)}
          categories={categories}
          categoryOpen={categoryOpen}
          categoryId={categoryId}
          onCategoryOpen={() => setCategoryOpen((v) => !v)}
          onCategoryChange={setCategoryId}
          onApplyCategory={() => runBulkAction('setCategory')}
        />
      )}

      {bulk.error ? (
        <div
          aria-live="polite"
          className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-1.5"
        >
          <span>{bulk.error}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex items-center p-1 rounded-2xl bg-neutral-100/80 dark:bg-neutral-900/80 border border-neutral-200/60 dark:border-neutral-800/60 shadow-2xs overflow-x-auto no-scrollbar max-w-full"
          role="tablist"
          aria-label={BLOGPRESS_COPY.filterAria}
          data-visual="blogpress-filters"
        >
          {filters.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={activeFilter === f.value}
              aria-controls="tabpanel-posts"
              id={`tab-${f.value}`}
              onClick={() => setActiveFilter(f.value)}
              className={cn(
                'relative inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-xl transition-safe duration-200 ease-out shrink-0 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                activeFilter === f.value
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-2xs font-bold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40'
              )}
            >
              <span>{f.label}</span>
              {f.value !== 'all' && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-bold rounded-full transition-safe duration-200',
                    activeFilter === f.value
                      ? 'bg-primary/10 text-primary dark:bg-primary/20'
                      : 'bg-neutral-200/70 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                  )}
                >
                  {countByStatus[f.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 md:w-72 group" data-visual="blogpress-search">
          <Search className="absolute inset-s-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400 pointer-events-none transition-colors group-focus-within:text-primary" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={BLOGPRESS_COPY.searchPlaceholder}
            aria-label={BLOGPRESS_COPY.searchAria}
            className="w-full h-9 ps-9 pe-9 rounded-xl bg-neutral-100/60 dark:bg-neutral-900/60 border border-neutral-200/80 dark:border-neutral-800/80 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none transition-safe duration-200"
          />
          {searchQuery ? (
            <button
              onClick={() => {
                setSearchQuery('');
                searchRef.current?.focus();
              }}
              className="absolute inset-e-2 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-safe cursor-pointer"
              aria-label={BLOGPRESS_COPY.clearSearch}
            >
              <X className="size-3" />
            </button>
          ) : (
            <kbd className="absolute inset-e-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-neutral-400 border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 pointer-events-none select-none">
              <span className="text-[9px]">⌘</span>K
            </kbd>
          )}
        </div>
      </div>

      {searchQuery && (
        <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
          <span>
            {filteredPosts.length === 0
              ? BLOGPRESS_COPY.searchNoResults
              : fill(BLOGPRESS_COPY.searchFound, { count: filteredPosts.length })}
          </span>
        </div>
      )}

      <div
        className="space-y-2.5"
        role="tabpanel"
        id="tabpanel-posts"
        aria-labelledby={`tab-${activeFilter}`}
        data-visual="blogpress-list"
      >
        {filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20 p-8 text-center transition-safe">
            <EmptyState
              icon={FileText}
              className="py-12"
              title={searchQuery ? BLOGPRESS_COPY.searchNoResults : BLOGPRESS_COPY.emptyTitle}
              description={
                searchQuery
                  ? BLOGPRESS_COPY.emptySearchBody
                  : activeFilter === 'all'
                    ? BLOGPRESS_COPY.emptyAllBody
                    : BLOGPRESS_COPY.emptyFilterBody
              }
              action={
                !searchQuery && activeFilter === 'all' ? (
                  <Button
                    className="transition-safe duration-200 shadow-sm hover:shadow-md rounded-xl active:scale-[0.98] font-medium"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const id = await createPostOrReportFailure();
                        if (id !== null) router.push(`/blogpress/editor/${id}`);
                      })
                    }
                    aria-busy={pending}
                    aria-live="polite"
                  >
                    {pending ? (
                      <LoaderCircle className="ms-2 size-4 animate-spin" />
                    ) : (
                      <Plus className="ms-2 size-4" />
                    )}
                    {pending ? BLOGPRESS_COPY.creatingPost : BLOGPRESS_COPY.newPost}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          filteredPosts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              tags={tagsByPost?.[post.id] ?? []}
              isSelected={bulk.selected.has(post.id)}
              onToggleSelect={bulk.toggle}
            />
          ))
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={BLOGPRESS_COPY.bulkDeleteTitle}
        message={fill(BLOGPRESS_COPY.bulkDeleteMessage, { count: bulk.selectedCount })}
        confirmLabel={BLOGPRESS_COPY.bulkDelete}
        cancelLabel={BLOGPRESS_COPY.cancel}
        icon={Trash}
        variant="danger"
        onConfirm={() => runBulkAction('delete')}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
});
const PostRow = memo(function PostRow({
  post,
  tags,
  isSelected,
  onToggleSelect,
}: {
  post: Post;
  tags: PostTag[];
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const router = useRouter();
  const wordCount = estimateWordCount(post.content);
  const readingTime = estimateReadingTime(post.content);
  const label = postExcerpt(post.content, post.meta_desc ?? '') || BLOGPRESS_COPY.untitled;
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <article
      className={cn(
        'group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900/50 border transition-safe duration-300 ease-out',
        isSelected
          ? 'border-primary/50 ring-1 ring-primary/20 bg-primary/[0.03] dark:bg-primary/[0.04]'
          : 'border-neutral-200/70 dark:border-neutral-800/80 hover:border-neutral-300 dark:hover:border-neutral-700/80 hover:shadow-md dark:hover:shadow-neutral-950/50'
      )}
      data-visual="blogpress-row"
    >
      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onToggleSelect(post.id)}
          aria-pressed={isSelected}
          aria-label={isSelected ? BLOGPRESS_COPY.deselectPost : BLOGPRESS_COPY.selectPost}
          className="shrink-0 size-5 rounded-md border flex items-center justify-center transition-safe duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            className={cn(
              'size-5 rounded-md border flex items-center justify-center transition-colors',
              isSelected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-neutral-300 dark:border-neutral-600 hover:border-primary/50'
            )}
          >
            {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        </button>

        <Link
          href={`/blogpress/editor/${post.id}`}
          className="shrink-0 relative group/thumb overflow-hidden rounded-xl ring-1 ring-neutral-200/80 dark:ring-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {post.cover_image ? (
            <div className="size-12 sm:size-14 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800">
              <Image
                src={post.cover_image}
                alt=""
                width={56}
                height={56}
                className="object-cover size-full group-hover/thumb:scale-105 transition-transform duration-300 ease-out"
                unoptimized
              />
            </div>
          ) : (
            <div className="size-12 sm:size-14 rounded-xl bg-linear-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center group-hover/thumb:scale-105 transition-transform duration-300 ease-out">
              <FileText className="size-5 sm:size-6 text-primary/60" />
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            {post.featured && (
              <span
                className="inline-flex items-center shrink-0 p-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20"
                title={BLOGPRESS_COPY.pinned}
              >
                <Pin className="size-3 fill-amber-500/20" aria-label={BLOGPRESS_COPY.pinned} />
              </span>
            )}
            <Link
              href={`/blogpress/editor/${post.id}`}
              className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100 hover:text-primary transition-colors truncate block focus-visible:outline-none focus-visible:underline"
            >
              {label}
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500 truncate max-w-35 sm:max-w-50">
              /{post.slug}
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">&bull;</span>
            <span className="flex items-center gap-1 font-medium">
              <Clock className="size-3 text-neutral-400" />
              {fill(BLOGPRESS_COPY.wordCount, {
                count: wordCount.toLocaleString('ar-u-nu-latn'),
              })}{' '}
              &bull; {formatReadingTime(readingTime)}
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">&bull;</span>
            <span className="flex items-center gap-1">
              <Eye className="size-3 text-neutral-400" />
              {(post.view_count ?? 0).toLocaleString('ar-u-nu-latn')}
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">&bull;</span>
            <span className="text-neutral-500 dark:text-neutral-400">
              {post.status === 'published'
                ? fill(BLOGPRESS_COPY.publishedOn, {
                    date: post.published_at
                      ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          calendar: 'islamic-umalqura',
                        }).format(new Date(post.published_at))
                      : '',
                  })
                : post.status === 'scheduled'
                  ? fill(BLOGPRESS_COPY.scheduledFor, {
                      date: post.publish_at
                        ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            calendar: 'islamic-umalqura',
                          }).format(new Date(post.publish_at))
                        : '',
                    })
                  : fill(BLOGPRESS_COPY.lastModified, {
                      date: new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        calendar: 'islamic-umalqura',
                      }).format(new Date(post.updated_at)),
                    })}
            </span>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center rounded-full bg-primary/5 text-primary border border-primary/15 px-2 py-0.5 text-[11px] font-medium"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100 dark:border-neutral-800/60">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border shadow-2xs',
            post.status === 'published'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : post.status === 'scheduled'
                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              post.status === 'published'
                ? 'bg-emerald-500'
                : post.status === 'scheduled'
                  ? 'bg-sky-500'
                  : 'bg-amber-500'
            )}
          />
          {post.status === 'published'
            ? BLOGPRESS_COPY.statusPublished
            : post.status === 'scheduled'
              ? BLOGPRESS_COPY.statusScheduled
              : BLOGPRESS_COPY.statusDraft}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={BLOGPRESS_COPY.postActions}
              className="rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-44 rounded-xl p-1.5 shadow-lg border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900"
          >
            <DropdownMenuItem asChild>
              <Link
                href={`/blogpress/editor/${post.id}`}
                className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
              >
                <PenLine className="size-4 text-neutral-500 me-2" />
                <span>{BLOGPRESS_COPY.actionEdit}</span>
              </Link>
            </DropdownMenuItem>
            {post.status === 'published' && (
              <DropdownMenuItem asChild>
                <Link
                  href={`/community/${post.slug}`}
                  target="_blank"
                  className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
                >
                  <ExternalLink className="size-4 text-neutral-500 me-2" />
                  <span>{BLOGPRESS_COPY.actionView}</span>
                </Link>
              </DropdownMenuItem>
            )}
            {post.status === 'draft' ? (
              <DropdownMenuItem
                onClick={async () => {
                  if (!requireConnection()) return;
                  try {
                    await publishPost(post.id);
                    router.refresh();
                  } catch {
                    toast.error(BLOGPRESS_COPY.publishFailed);
                  }
                }}
                className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
              >
                <Eye className="size-4 text-neutral-500 me-2" />
                <span>{BLOGPRESS_COPY.actionPublish}</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={async () => {
                  if (!requireConnection()) return;
                  try {
                    if (post.status === 'scheduled') {
                      await publishPost(post.id);
                    } else {
                      await unpublishPost(post.id);
                    }
                    router.refresh();
                  } catch {
                    toast.error(
                      post.status === 'scheduled'
                        ? BLOGPRESS_COPY.publishNowFailed
                        : BLOGPRESS_COPY.unpublishFailed
                    );
                  }
                }}
                className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
              >
                {post.status === 'scheduled' ? (
                  <Eye className="size-4 text-neutral-500 me-2" />
                ) : (
                  <EyeOff className="size-4 text-neutral-500 me-2" />
                )}
                <span>
                  {post.status === 'scheduled'
                    ? BLOGPRESS_COPY.actionPublishNow
                    : BLOGPRESS_COPY.actionUnpublish}
                </span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await setPostFeatured(post.id, !post.featured);
                  router.refresh();
                } catch {
                  toast.error(BLOGPRESS_COPY.featureFailed);
                }
              }}
              className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
            >
              {post.featured ? (
                <PinOff className="size-4 text-neutral-500 me-2" />
              ) : (
                <Pin className="size-4 text-neutral-500 me-2" />
              )}
              <span>{post.featured ? BLOGPRESS_COPY.actionUnpin : BLOGPRESS_COPY.actionPin}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await duplicatePost(post.id);
                  toast.success(BLOGPRESS_COPY.duplicateDone);
                  router.refresh();
                } catch {
                  toast.error(BLOGPRESS_COPY.duplicateFailed);
                }
              }}
              className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
            >
              <CopyPlus className="size-4 text-neutral-500 me-2" />
              <span>{BLOGPRESS_COPY.actionDuplicate}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await downloadPostAsFile(label, post.content ?? '', 'markdown');
                  toast.success(BLOGPRESS_COPY.exportMarkdownDone);
                } catch {
                  toast.error(BLOGPRESS_COPY.exportFailed);
                }
              }}
              className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
            >
              <FileDown className="size-4 text-neutral-500 me-2" />
              <span>{BLOGPRESS_COPY.actionExportMarkdown}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await downloadPostAsFile(label, post.content ?? '', 'html');
                  toast.success(BLOGPRESS_COPY.exportHtmlDone);
                } catch {
                  toast.error(BLOGPRESS_COPY.exportFailed);
                }
              }}
              className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
            >
              <FileCodeCorner className="size-4 text-neutral-500 me-2" />
              <span>{BLOGPRESS_COPY.actionExportHtml}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 border-neutral-100 dark:border-neutral-800" />
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/30"
                >
                  <Trash className="size-4 text-red-500 me-2" />
                  <span>{BLOGPRESS_COPY.actionDelete}</span>
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 max-w-md p-6">
                <DialogHeader className="space-y-2 text-start">
                  <DialogTitle className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    {BLOGPRESS_COPY.deleteTitle}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {fill(BLOGPRESS_COPY.deleteMessage, { label })}
                  </DialogDescription>
                </DialogHeader>
                <DialogActions onCancel={() => setDeleteOpen(false)} className="mt-6">
                  <HeroCtaButton
                    type="button"
                    variant="hero-destructive"
                    onClick={async () => {
                      setDeleteOpen(false);
                      try {
                        await deletePost(post.id);
                        toast(BLOGPRESS_COPY.deleted, {
                          action: {
                            label: BLOGPRESS_COPY.undo,
                            onClick: async () => {
                              try {
                                await restorePost({
                                  id: post.id,
                                  slug: post.slug,
                                  content: post.content,
                                  cover_image: post.cover_image,
                                  meta_title: post.meta_title,
                                  meta_desc: post.meta_desc,
                                  tagIds: tags.map((t) => t.id),
                                });
                                router.refresh();
                              } catch {
                                toast.error(BLOGPRESS_COPY.restoreFailed);
                              }
                            },
                          },
                        });
                        router.refresh();
                      } catch {
                        toast.error(BLOGPRESS_COPY.deleteFailed);
                      }
                    }}
                    className="w-full sm:w-auto"
                  >
                    {BLOGPRESS_COPY.delete}
                  </HeroCtaButton>
                </DialogActions>
              </DialogContent>
            </Dialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
});

interface CategoryChipProps {
  label: string;
  slug: string | undefined;
  active: boolean;
  onSelect: (slug: string | undefined) => void;
}

function filterPosts(posts: Post[], status: PostStatus | 'all', query: string): Post[] {
  let filtered = status === 'all' ? posts : posts.filter((p) => p.status === status);

  if (query.trim()) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        (p.content ?? '').toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.meta_desc ?? '').toLowerCase().includes(q)
    );
  }

  return filtered;
}

interface BulkActionBarProps {
  allSelected: boolean;
  total: number;
  selectedCount: number;
  busy: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onOpenDelete: () => void;
  categories: PostCategory[];
  categoryOpen: boolean;
  categoryId: string;
  onCategoryOpen: () => void;
  onCategoryChange: (id: string) => void;
  onApplyCategory: () => void;
}

const BulkActionBar = memo(function BulkActionBar({
  allSelected,
  total,
  selectedCount,
  busy,
  onToggleAll,
  onClear,
  onPublish,
  onUnpublish,
  onOpenDelete,
  categories,
  categoryOpen,
  categoryId,
  onCategoryOpen,
  onCategoryChange,
  onApplyCategory,
}: BulkActionBarProps) {
  const hasSelection = selectedCount > 0;
  return (
    <div className="sticky top-3 z-20 bg-card/90 border border-border rounded-2xl p-3 shadow-sm flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={onToggleAll}
        aria-pressed={allSelected}
        className="inline-flex items-center gap-2 text-xs font-bold text-foreground hover:text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md p-1"
      >
        <span
          className={cn(
            'size-5 rounded-md border flex items-center justify-center transition-colors',
            allSelected
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-neutral-400 dark:border-neutral-500'
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
        {BLOGPRESS_COPY.bulkSelectAll}
      </button>

      <span className="text-xs text-muted-foreground">
        {hasSelection
          ? fill(BLOGPRESS_COPY.bulkCount, { selected: selectedCount, total })
          : fill(BLOGPRESS_COPY.bulkTotal, { total })}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onClear}
        disabled={!hasSelection || busy}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {BLOGPRESS_COPY.bulkClear}
      </button>

      <button
        type="button"
        onClick={onPublish}
        disabled={!hasSelection || busy}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Eye className="size-3.5" />
        {BLOGPRESS_COPY.bulkPublish}
      </button>

      <button
        type="button"
        onClick={onUnpublish}
        disabled={!hasSelection || busy}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <EyeOff className="size-3.5" />
        {BLOGPRESS_COPY.bulkUnpublish}
      </button>

      <button
        type="button"
        onClick={onCategoryOpen}
        disabled={!hasSelection || busy || categories.length === 0}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <FolderInput className="size-3.5" />
        {BLOGPRESS_COPY.bulkCategory}
      </button>

      {categoryOpen ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={categoryId}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label={BLOGPRESS_COPY.bulkCategoryAria}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary h-8"
          >
            <option value="">{BLOGPRESS_COPY.bulkChooseCategory}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onApplyCategory}
            disabled={!categoryId || busy}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : BLOGPRESS_COPY.bulkApply}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onOpenDelete}
        disabled={!hasSelection || busy}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Trash className="size-3.5" />
        {BLOGPRESS_COPY.bulkDelete}
      </button>
    </div>
  );
});

function CategoryChip({ label, slug, active, onSelect }: CategoryChipProps) {
  return (
    <button
      onClick={() => onSelect(slug)}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-medium transition-safe duration-200 ease-out shrink-0 cursor-pointer select-none border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        active
          ? 'bg-primary/10 text-primary border-primary/30 dark:bg-primary/20 shadow-2xs font-bold'
          : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200/80 dark:border-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
      )}
    >
      {label}
    </button>
  );
}
