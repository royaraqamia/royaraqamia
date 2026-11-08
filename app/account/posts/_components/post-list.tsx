'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Check,
  Clock,
  CopyPlus,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  FileCodeCorner,
  FileDown,
  FileText,
  LoaderCircle,
  PenLine,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import {
  bulkPostAction,
  deletePost,
  duplicatePost,
  publishPost,
  restorePost,
  setPostFeatured,
  unpublishPost,
} from '@/frontend/api/blogpress';
import { downloadPostAsFile } from '@/frontend/shared/blogpress/export-post';
import { postExcerpt } from '@/shared/reading-time';
import { formatHijriDate } from '@/frontend/shared/format';
import { cn } from '@/frontend/shared/cn';
import type { Post, PostStatus } from '@/shared/contracts/blogpress';

interface PostListProps {
  posts: Post[];
  onEdit: (post: Post) => void;
  /** Repaints the store after a server-owned transition. */
  onChanged: () => Promise<void> | void;
  onCreate: () => void;
  initialFilter?: PostStatus | 'all';
}

const filters: { label: string; value: PostStatus | 'all' }[] = [
  { label: 'الكل', value: 'all' },
  { label: 'مسودَّات', value: 'draft' },
  { label: 'مجدولة', value: 'scheduled' },
  { label: 'منشورة', value: 'published' },
];

function fill(value: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, replacement]) => text.split(`{${key}}`).join(String(replacement)),
    value
  );
}

function requireConnection(action: string): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast.error(`${action} يتطلَّب اتصالاً بالإنترنت`);
    return false;
  }
  return true;
}

/** Pinned first, then the store's newest-updated order. */
function ordered(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => Number(b.featured) - Number(a.featured));
}

function filtered(posts: Post[], status: PostStatus | 'all', query: string): Post[] {
  let rows = status === 'all' ? posts : posts.filter((post) => post.status === status);
  const term = query.trim().toLowerCase();
  if (term) {
    rows = rows.filter(
      (post) =>
        (post.content ?? '').toLowerCase().includes(term) ||
        post.slug.toLowerCase().includes(term) ||
        (post.meta_desc ?? '').toLowerCase().includes(term)
    );
  }
  return ordered(rows);
}

function statusLabel(status: PostStatus): string {
  return status === 'published' ? 'منشورة' : status === 'scheduled' ? 'مجدولة' : 'مسودَّة';
}

export function PostList({
  posts,
  onEdit,
  onChanged,
  onCreate,
  initialFilter = 'all',
}: PostListProps) {
  const [activeFilter, setActiveFilter] = useState<PostStatus | 'all'>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () => filtered(posts, activeFilter, searchQuery),
    [posts, activeFilter, searchQuery]
  );
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  // A selection belongs to the list it was made on: filtering it away must not
  // leave ids a bulk action would still reach.
  useEffect(() => {
    setSelected(new Set());
  }, [activeFilter, searchQuery]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  };

  const countByStatus = useMemo(
    () => ({
      draft: posts.filter((post) => post.status === 'draft').length,
      scheduled: posts.filter((post) => post.status === 'scheduled').length,
      published: posts.filter((post) => post.status === 'published').length,
    }),
    [posts]
  );

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex max-w-full items-center overflow-x-auto rounded-2xl border border-border/60 bg-muted/40 p-1 no-scrollbar"
          role="tablist"
          aria-label="تصفية المنشورات"
        >
          {filters.map((filter) => (
            <button
              key={filter.value}
              role="tab"
              aria-selected={activeFilter === filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-medium transition-safe',
                activeFilter === filter.value
                  ? 'bg-background font-bold text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {filter.label}
              {filter.value !== 'all' ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold">
                  {countByStatus[filter.value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ابحث في منشوراتك"
            aria-label="ابحث في منشوراتك"
            className="h-10 w-full rounded-xl border border-border/70 bg-background ps-9 pe-3 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                searchRef.current?.focus();
              }}
              aria-label="مسح البحث"
              className="absolute inset-e-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>

      {rows.length > 0 ? (
        <BulkBar
          rows={rows}
          selected={selected}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onClear={() => setSelected(new Set())}
          onChanged={onChanged}
        />
      ) : null}

      <div className="space-y-2.5" role="tabpanel">
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            variant="card"
            title={searchQuery ? 'لا نتائج' : 'لا توجد منشورات بعد'}
            description={
              searchQuery
                ? 'لم نجد منشوراً يطابق بحثك.'
                : activeFilter === 'all'
                  ? 'ابدأ بكتابة أوَّل منشور لك.'
                  : 'لا توجد منشورات في هذه الحالة.'
            }
            action={
              !searchQuery && activeFilter === 'all' ? (
                <Button onClick={onCreate}>
                  <Plus className="ms-1.5 size-4" />
                  منشور جديد
                </Button>
              ) : undefined
            }
          />
        ) : (
          rows.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              isSelected={selected.has(post.id)}
              onToggleSelect={toggle}
              onEdit={onEdit}
              onChanged={onChanged}
            />
          ))
        )}
      </div>
    </div>
  );
}

function BulkBar({
  rows,
  selected,
  allSelected,
  onToggleAll,
  onClear,
  onChanged,
}: {
  rows: Post[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const run = async (action: 'publish' | 'unpublish' | 'delete') => {
    if (
      (action === 'publish' || action === 'unpublish') &&
      !requireConnection('تغيير حالة النَّشر')
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await bulkPostAction(action, Array.from(selected));
      toast.success(
        action === 'delete'
          ? fill('تمَّ حذف {count} منشور', { count: result.affected })
          : action === 'publish'
            ? fill('تمَّ نشر {count} منشور', { count: result.affected })
            : fill('تمَّ إلغاء نشر {count} منشور', { count: result.affected })
      );
      onClear();
      setConfirmOpen(false);
      await onChanged();
    } catch {
      toast.error('فشل تنفيذ الإجراء');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sticky top-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-sm">
        <button
          type="button"
          onClick={onToggleAll}
          aria-pressed={allSelected}
          className="inline-flex items-center gap-2 p-1 text-xs font-bold text-foreground"
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-md border',
              allSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
            )}
          >
            {allSelected ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
          تحديد الكل
        </button>
        <span className="text-xs text-muted-foreground">
          {selected.size > 0
            ? fill('{selected} من {total}', { selected: selected.size, total: rows.length })
            : fill('{total} منشور', { total: rows.length })}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={selected.size === 0 || busy}
          onClick={() => void run('publish')}
        >
          <Eye className="me-1.5 size-3.5" />
          نشر
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={selected.size === 0 || busy}
          onClick={() => void run('unpublish')}
        >
          <EyeOff className="me-1.5 size-3.5" />
          إلغاء النَّشر
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={selected.size === 0 || busy}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash className="me-1.5 size-3.5" />
          حذف
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="حذف المنشورات"
        message={fill('هل تريد حذف {count} منشور؟ لا يمكن التَّراجع بعد انتهاء المهلة.', {
          count: selected.size,
        })}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        icon={Trash}
        variant="danger"
        onConfirm={() => void run('delete')}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function PostRow({
  post,
  isSelected,
  onToggleSelect,
  onEdit,
  onChanged,
}: {
  post: Post;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (post: Post) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = postExcerpt(post.content, post.meta_desc ?? '') || 'بدون عنوان';

  const act = async (run: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await run();
      await onChanged();
    } catch {
      toast.error(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="group flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card p-3.5 transition-safe hover:border-border hover:shadow-md sm:flex-row sm:items-center sm:p-4">
      <div className="flex min-w-0 flex-1 items-start gap-3.5 sm:items-center">
        <button
          type="button"
          onClick={() => onToggleSelect(post.id)}
          aria-pressed={isSelected}
          aria-label={isSelected ? 'إلغاء تحديد المنشور' : 'تحديد المنشور'}
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-md border',
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:border-primary/50'
            )}
          >
            {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onEdit(post)}
          className="relative shrink-0 overflow-hidden rounded-xl ring-1 ring-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="تعديل المنشور"
        >
          {post.cover_image ? (
            <Image
              src={post.cover_image}
              alt=""
              width={56}
              height={56}
              unoptimized
              className="size-12 rounded-xl object-cover sm:size-14"
            />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary/70 sm:size-14">
              <FileText className="size-5" />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            {post.featured ? (
              <span
                className="inline-flex shrink-0 items-center rounded-md bg-amber-500/10 p-1 text-amber-600 ring-1 ring-amber-500/20"
                title="مثبَّت"
              >
                <Pin className="size-3" aria-label="مثبَّت" />
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onEdit(post)}
              className="block truncate text-start text-sm font-bold text-foreground hover:text-primary sm:text-base"
            >
              {label}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate font-mono text-[11px]">/{post.slug}</span>
            <span aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" />
              {(post.view_count ?? 0).toLocaleString('ar-u-nu-latn')}
            </span>
            {post.published_at ? (
              <>
                <span aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatHijriDate(post.published_at)}
                </span>
              </>
            ) : post.publish_at ? (
              <>
                <span aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatHijriDate(post.publish_at, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true">•</span>
                <span>آخر تعديل {formatHijriDate(post.updated_at)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 pt-2 sm:justify-end sm:border-0 sm:pt-0">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold',
            post.status === 'published'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
              : post.status === 'scheduled'
                ? 'border-sky-500/20 bg-sky-500/10 text-sky-600'
                : 'border-amber-500/20 bg-amber-500/10 text-amber-600'
          )}
        >
          {statusLabel(post.status)}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="إجراءات المنشور" disabled={busy}>
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Ellipsis className="size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={() => onEdit(post)}>
              <PenLine className="me-2 size-4" />
              تعديل
            </DropdownMenuItem>
            {post.status === 'published' ? (
              <DropdownMenuItem asChild>
                <Link href={`/community/${post.slug}`} target="_blank">
                  <ExternalLink className="me-2 size-4" />
                  عرض المنشور
                </Link>
              </DropdownMenuItem>
            ) : null}
            {post.status === 'published' ? (
              <DropdownMenuItem
                onClick={() => void act(() => unpublishPost(post.id), 'فشل إلغاء نشر المنشور')}
              >
                <EyeOff className="me-2 size-4" />
                إلغاء النَّشر
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => void act(() => publishPost(post.id), 'فشل نشر المنشور')}
              >
                <Eye className="me-2 size-4" />
                {post.status === 'scheduled' ? 'نشر الآن' : 'نشر'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                void act(() => setPostFeatured(post.id, !post.featured), 'فشل تحديث التَّثبيت')
              }
            >
              {post.featured ? <PinOff className="me-2 size-4" /> : <Pin className="me-2 size-4" />}
              {post.featured ? 'إلغاء التَّثبيت' : 'تثبيت'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void act(() => duplicatePost(post.id), 'فشل نسخ المنشور')}
            >
              <CopyPlus className="me-2 size-4" />
              نسخ المنشور
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void downloadPostAsFile(label, post.content ?? '', 'markdown')
                  .then(() => toast.success('تمَّ تصدير المنشور بصيغة Markdown'))
                  .catch(() => toast.error('فشل تصدير المنشور'));
              }}
            >
              <FileDown className="me-2 size-4" />
              تصدير Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void downloadPostAsFile(label, post.content ?? '', 'html')
                  .then(() => toast.success('تمَّ تصدير المنشور بصيغة HTML'))
                  .catch(() => toast.error('فشل تصدير المنشور'));
              }}
            >
              <FileCodeCorner className="me-2 size-4" />
              تصدير HTML
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => {
                event.preventDefault();
                setDeleteOpen(true);
              }}
            >
              <Trash className="me-2 size-4" />
              حذف
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="حذف المنشور"
        message={fill('هل تريد حذف «{label}»؟', { label })}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        icon={Trash}
        variant="danger"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          setBusy(true);
          void deletePost(post.id)
            .then(() => {
              toast.success('تمَّ حذف المنشور', {
                action: {
                  label: 'تراجع',
                  onClick: () => {
                    void restorePost({
                      id: post.id,
                      slug: post.slug,
                      content: post.content,
                      cover_image: post.cover_image,
                      meta_title: post.meta_title,
                      meta_desc: post.meta_desc,
                    })
                      .then(() => onChanged())
                      .catch(() => toast.error('فشل استرجاع المنشور'));
                  },
                },
              });
            })
            .catch(() => toast.error('فشل حذف المنشور'))
            .finally(() => {
              setBusy(false);
              void onChanged();
            });
        }}
      />
    </article>
  );
}
