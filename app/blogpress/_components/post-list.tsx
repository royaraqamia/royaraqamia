'use client';

import { useState, useTransition, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import {
  FileText,
  MoreHorizontal,
  Eye,
  EyeOff,
  Trash2,
  PenLine,
  Plus,
  Loader2,
  Search,
  X,
  ExternalLink,
  Clock,
  Pin,
  PinOff,
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
  createPost,
  setPostFeatured,
} from '@/frontend/api/blogpress';
import type { Post, PostTag, PostCategory, PostStatus } from '@/shared/contracts/blogpress';
import { cn } from '@/frontend/shared/cn';
import {
  estimateWordCount,
  estimateReadingTime,
  formatReadingTime,
} from '@/frontend/shared/reading-time';
import { toast } from 'sonner';

interface PostListProps {
  posts: Post[];
  categories: PostCategory[];
  activeCategory?: string;
  tagsByPost?: Record<string, PostTag[]>;
}

const filters: { label: string; value: PostStatus | 'all' }[] = [
  { label: 'الكل', value: 'all' },
  { label: 'مسودَّة', value: 'draft' },
  { label: 'مجدولة', value: 'scheduled' },
  { label: 'منشور', value: 'published' },
];

export function PostList({ posts, categories, activeCategory, tagsByPost }: PostListProps) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<PostStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

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

  const filteredPosts = useMemo(() => {
    let filtered = activeFilter === 'all' ? posts : posts.filter((p) => p.status === activeFilter);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.meta_desc ?? '').toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [posts, activeFilter, searchQuery]);

  const countByStatus = useMemo(
    () => ({
      draft: posts.filter((p) => p.status === 'draft').length,
      scheduled: posts.filter((p) => p.status === 'scheduled').length,
      published: posts.filter((p) => p.status === 'published').length,
    }),
    [posts]
  );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {categories.length > 0 && (
        <nav
          className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar -mx-1 px-1"
          aria-label="تصفية حسب التَّصنيف"
        >
          <CategoryChip
            label="كلّ التَّصنيفات"
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex items-center p-1 rounded-2xl bg-neutral-100/80 dark:bg-neutral-900/80 border border-neutral-200/60 dark:border-neutral-800/60 backdrop-blur-md shadow-2xs overflow-x-auto no-scrollbar max-w-full"
          role="tablist"
          aria-label="تصفية المقالات"
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
                'relative inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-xl transition-all duration-200 ease-out shrink-0 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                activeFilter === f.value
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40'
              )}
            >
              <span>{f.label}</span>
              {f.value !== 'all' && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-semibold rounded-full transition-all duration-200',
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

        <div className="relative w-full sm:w-64 md:w-72 group">
          <Search className="absolute inset-s-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400 pointer-events-none transition-colors group-focus-within:text-primary" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في المقالات..."
            aria-label="بحث في المقالات"
            className="w-full h-9 ps-9 pe-9 rounded-xl bg-neutral-100/60 dark:bg-neutral-900/60 border border-neutral-200/80 dark:border-neutral-800/80 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none transition-all duration-200"
          />
          {searchQuery ? (
            <button
              onClick={() => {
                setSearchQuery('');
                searchRef.current?.focus();
              }}
              className="absolute inset-e-2 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-all cursor-pointer"
              aria-label="مسح البحث"
            >
              <X className="size-3" />
            </button>
          ) : (
            <kbd className="absolute inset-e-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-neutral-400 border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 pointer-events-none select-none">
              <span className="text-[9px]">⌘</span>K
            </kbd>
          )}
        </div>
      </div>

      {searchQuery && (
        <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
          <span>
            {filteredPosts.length === 0
              ? 'لا توجد نتائج للبحث'
              : `عُثِرَ على ${filteredPosts.length} نتيجة`}
          </span>
        </div>
      )}

      <div
        className="space-y-2.5"
        role="tabpanel"
        id="tabpanel-posts"
        aria-labelledby={`tab-${activeFilter}`}
      >
        {filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20 p-8 text-center transition-all">
            <EmptyState
              icon={FileText}
              className="py-12"
              title={searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد مقالات بعد'}
              description={
                searchQuery
                  ? 'لم نعثر على مقالات تُطابق بحثك.'
                  : activeFilter === 'all'
                    ? 'أنشِئ مقالك الأوَّل للبدء في الكتابة.'
                    : 'لا توجد مقالات في هذا التَّصنيف.'
              }
              action={
                !searchQuery && activeFilter === 'all' ? (
                  <Button
                    className="transition-all duration-200 shadow-sm hover:shadow-md rounded-xl active:scale-[0.98] font-medium"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          const { id } = await createPost();
                          router.push(`/blogpress/editor/${id}`);
                        } catch {
                          // Navigation will not occur on failure
                        }
                      })
                    }
                    aria-busy={pending}
                    aria-live="polite"
                  >
                    {pending ? (
                      <Loader2 className="ms-2 size-4 animate-spin" />
                    ) : (
                      <Plus className="ms-2 size-4" />
                    )}
                    {pending ? 'جاري الإنشاء...' : 'مقال جديد'}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          filteredPosts.map((post) => (
            <PostRow key={post.id} post={post} tags={tagsByPost?.[post.id] ?? []} />
          ))
        )}
      </div>
    </div>
  );
}

function PostRow({ post, tags }: { post: Post; tags: PostTag[] }) {
  const router = useRouter();
  const wordCount = estimateWordCount(post.content);
  const readingTime = estimateReadingTime(post.content);

  return (
    <article className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900/50 border border-neutral-200/70 dark:border-neutral-800/80 hover:border-neutral-300 dark:hover:border-neutral-700/80 hover:shadow-md dark:hover:shadow-neutral-950/50 transition-all duration-300 ease-out">
      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
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
                title="مُثبَّت"
              >
                <Pin className="size-3 fill-amber-500/20" aria-label="مُثبَّت" />
              </span>
            )}
            <Link
              href={`/blogpress/editor/${post.id}`}
              className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary transition-colors truncate block focus-visible:outline-none focus-visible:underline"
            >
              {post.title || 'بدون عنوان'}
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500 truncate max-w-35 sm:max-w-50">
              /{post.slug}
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">&bull;</span>
            <span className="flex items-center gap-1 font-medium">
              <Clock className="size-3 text-neutral-400" />
              {wordCount.toLocaleString('ar-u-nu-latn')} كلمة &bull;{' '}
              {formatReadingTime(readingTime)}
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">&bull;</span>
            <span className="flex items-center gap-1">
              <Eye className="size-3 text-neutral-400" />
              {(post.view_count ?? 0).toLocaleString('ar-u-nu-latn')}
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">&bull;</span>
            <span className="text-neutral-500 dark:text-neutral-400">
              {post.status === 'published'
                ? `نُشِرَ ${post.published_at ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'islamic-umalqura' }).format(new Date(post.published_at)) : ''}`
                : post.status === 'scheduled'
                  ? `يُنشَر في ${post.publish_at ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', calendar: 'islamic-umalqura' }).format(new Date(post.publish_at)) : ''}`
                  : `آخر تعديل ${new Intl.DateTimeFormat('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'islamic-umalqura' }).format(new Date(post.updated_at))}`}
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
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border shadow-2xs',
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
            ? 'منشور'
            : post.status === 'scheduled'
              ? 'مجدولة'
              : 'مسودَّة'}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="إجراءات المقال"
              className="rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <MoreHorizontal className="size-4" />
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
                <span>تعديل</span>
              </Link>
            </DropdownMenuItem>
            {post.status === 'published' && (
              <DropdownMenuItem asChild>
                <Link
                  href={`/blog/${post.slug}`}
                  target="_blank"
                  className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
                >
                  <ExternalLink className="size-4 text-neutral-500 me-2" />
                  <span>عرض</span>
                </Link>
              </DropdownMenuItem>
            )}
            {post.status === 'draft' ? (
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await publishPost(post.id);
                    router.refresh();
                  } catch {
                    toast.error('فشل نشر المقال');
                  }
                }}
                className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
              >
                <Eye className="size-4 text-neutral-500 me-2" />
                <span>نشر</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    if (post.status === 'scheduled') {
                      await publishPost(post.id);
                    } else {
                      await unpublishPost(post.id);
                    }
                    router.refresh();
                  } catch {
                    toast.error(
                      post.status === 'scheduled' ? 'فشل النَّشر الآن' : 'فشل إلغاء النَّشر'
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
                <span>{post.status === 'scheduled' ? 'نشر الآن' : 'إلغاء النَّشر'}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await setPostFeatured(post.id, !post.featured);
                  router.refresh();
                } catch {
                  toast.error('فشل تحديث التَّثبيت');
                }
              }}
              className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium"
            >
              {post.featured ? (
                <PinOff className="size-4 text-neutral-500 me-2" />
              ) : (
                <Pin className="size-4 text-neutral-500 me-2" />
              )}
              <span>{post.featured ? 'إلغاء التَّثبيت' : 'تثبيت'}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 border-neutral-100 dark:border-neutral-800" />
            <Dialog>
              <DialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/30"
                >
                  <Trash2 className="size-4 text-red-500 me-2" />
                  <span>حذف</span>
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 backdrop-blur-xl max-w-md p-6">
                <DialogHeader className="space-y-2 text-start">
                  <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    حذف المقال
                  </DialogTitle>
                  <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    هل أنت متأكِّد من حذف &ldquo;{post.title || 'بدون عنوان'}&rdquo;؟ لا يمكن
                    التَّراجع عن هذا الإجراء.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-end gap-2.5 mt-6">
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      type="button"
                      className="rounded-xl text-xs font-medium h-9 px-4"
                    >
                      إلغاء
                    </Button>
                  </DialogTrigger>
                  <DialogTrigger asChild>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        try {
                          await deletePost(post.id);
                          router.refresh();
                        } catch {
                          toast.error('فشل حذف المقال');
                        }
                      }}
                      className="rounded-xl text-xs font-medium h-9 px-4 bg-red-600 hover:bg-red-700 text-white"
                    >
                      حذف
                    </Button>
                  </DialogTrigger>
                </div>
              </DialogContent>
            </Dialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}

interface CategoryChipProps {
  label: string;
  slug: string | undefined;
  active: boolean;
  onSelect: (slug: string | undefined) => void;
}

function CategoryChip({ label, slug, active, onSelect }: CategoryChipProps) {
  return (
    <button
      onClick={() => onSelect(slug)}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-medium transition-all duration-200 ease-out shrink-0 cursor-pointer select-none border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        active
          ? 'bg-primary/10 text-primary border-primary/30 dark:bg-primary/20 shadow-2xs font-semibold'
          : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200/80 dark:border-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
      )}
    >
      {label}
    </button>
  );
}
