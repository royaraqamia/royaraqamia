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
} from 'lucide-react';
import { Button } from '@/frontend/ui/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/ui/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/ui/ui/dialog';
import { deletePost, unpublishPost, publishPost, createPost } from '@/frontend/api/blogpress';
import type { Post, PostStatus } from '@/shared/contracts/blogpress';
import { cn } from '@/frontend/shared/cn';
import {
  estimateWordCount,
  estimateReadingTime,
  formatReadingTime,
} from '@/frontend/shared/reading-time';
import { toast } from 'sonner';

interface PostListProps {
  posts: Post[];
}

const filters: { label: string; value: PostStatus | 'all' }[] = [
  { label: 'الكل', value: 'all' },
  { label: 'مسودَّة', value: 'draft' },
  { label: 'منشور', value: 'published' },
];

export function PostList({ posts }: PostListProps) {
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
      published: posts.filter((p) => p.status === 'published').length,
    }),
    [posts]
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/50"
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
                'relative inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg transition-smooth cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                activeFilter === f.value
                  ? 'bg-background text-foreground font-medium shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f.label}
              {f.value !== 'all' && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] font-normal rounded-full leading-none transition-smooth',
                    activeFilter === f.value
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted-foreground/10 text-muted-foreground'
                  )}
                >
                  {countByStatus[f.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative sm:ms-auto sm:min-w-56">
          <Search className="absolute inset-e-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في المقالات..."
            aria-label="بحث في المقالات"
            className="w-full h-9 pr-9 pl-8 rounded-lg bg-muted/50 border border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-xs placeholder:text-muted-foreground/40 outline-none transition-all"
          />
          {searchQuery ? (
            <button
              onClick={() => {
                setSearchQuery('');
                searchRef.current?.focus();
              }}
              className="absolute inset-s-2 top-1/2 -translate-y-1/2 size-6 flex items-center justify-center rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-smooth cursor-pointer"
              aria-label="مسح البحث"
            >
              <X className="size-3" />
            </button>
          ) : (
            <kbd className="absolute inset-s-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground/30 border border-border/50 bg-muted/30 leading-none pointer-events-none">
              <span className="text-[9px]">⌘</span>K
            </kbd>
          )}
        </div>
      </div>

      {searchQuery && (
        <div className="mb-4 text-xs text-muted-foreground/60">
          {filteredPosts.length === 0
            ? 'لا توجد نتائج للبحث'
            : `عُثر على ${filteredPosts.length} نتيجة`}
        </div>
      )}

      <div
        className="divide-y divide-border/50"
        role="tabpanel"
        id="tabpanel-posts"
        aria-labelledby={`tab-${activeFilter}`}
      >
        {filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mb-5">
              <FileText className="size-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold">
              {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد مقالات بعد'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
              {searchQuery
                ? 'لم نعثر على مقالات تطابق بحثك.'
                : activeFilter === 'all'
                  ? 'أنشئ مقالك الأوَّل للبدء في الكتابة.'
                  : 'لا توجد مقالات في هذا التَّصنيف.'}
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <Button
                className="mt-5 transition-smooth shadow-sm hover:shadow-md rounded-full"
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
                {pending ? 'جارٍ الإنشاء...' : 'مقال جديد'}
              </Button>
            )}
          </div>
        ) : (
          filteredPosts.map((post) => <PostRow key={post.id} post={post} />)
        )}
      </div>
    </div>
  );
}

function PostRow({ post }: { post: Post }) {
  const router = useRouter();
  const wordCount = estimateWordCount(post.content);
  const readingTime = estimateReadingTime(post.content);

  return (
    <div className="flex items-center gap-4 py-4 transition-smooth hover:bg-muted/30 -mx-2 px-2 rounded-lg">
      <Link href={`/blogpress/editor/${post.id}`} className="shrink-0">
        {post.cover_image ? (
          <div className="size-12 rounded-lg overflow-hidden bg-muted ring-1 ring-border/50">
            <Image
              src={post.cover_image}
              alt=""
              width={48}
              height={48}
              className="object-cover size-full"
              unoptimized
            />
          </div>
        ) : (
          <div className="size-12 rounded-lg bg-linear-to-br from-primary/10 to-primary/5 flex items-center justify-center ring-1 ring-border/50">
            <FileText className="size-5 text-primary/40" />
          </div>
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          href={`/blogpress/editor/${post.id}`}
          className="text-sm font-medium hover:text-primary transition-smooth truncate block"
        >
          {post.title || 'بدون عنوان'}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
          <span className="text-xs text-muted-foreground/60">/{post.slug}</span>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
            <Clock className="size-3" />
            {wordCount.toLocaleString('ar-u-nu-latn')} كلمة &middot;{' '}
            {formatReadingTime(readingTime)}
          </span>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-xs text-muted-foreground/60">
            {post.status === 'published'
              ? `نُشر ${post.published_at ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'islamic-umalqura' }).format(new Date(post.published_at)) : ''}`
              : `آخر تعديل ${new Intl.DateTimeFormat('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'islamic-umalqura' }).format(new Date(post.updated_at))}`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            post.status === 'published'
              ? 'bg-success/10 text-success'
              : 'bg-warning/10 text-warning'
          )}
        >
          {post.status === 'published' ? 'منشور' : 'مسودَّة'}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="إجراءات المقال"
              className="transition-smooth"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem asChild>
              <Link href={`/blogpress/editor/${post.id}`} className="cursor-pointer">
                <PenLine className="ms-2 size-4" />
                تعديل
              </Link>
            </DropdownMenuItem>
            {post.status === 'published' && (
              <DropdownMenuItem asChild>
                <Link href={`/blog/${post.slug}`} target="_blank" className="cursor-pointer">
                  <ExternalLink className="ms-2 size-4" />
                  عرض
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
                className="cursor-pointer"
              >
                <Eye className="ms-2 size-4" />
                نشر
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await unpublishPost(post.id);
                    router.refresh();
                  } catch {
                    toast.error('فشل إلغاء النَّشر');
                  }
                }}
                className="cursor-pointer"
              >
                <EyeOff className="ms-2 size-4" />
                إلغاء النَّشر
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <Dialog>
              <DialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
                  <Trash2 className="ms-2 size-4 text-destructive" />
                  <span className="text-destructive">حذف</span>
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>حذف المقال</DialogTitle>
                  <DialogDescription>
                    هل أنت متأكِّد من حذف &ldquo;{post.title || 'بدون عنوان'}&rdquo;؟ لا يمكن
                    التَّراجع عن هذا الإجراء.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2">
                  <DialogTrigger asChild>
                    <Button variant="outline" type="button" className="rounded-full">
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
                      className="rounded-full"
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
    </div>
  );
}
