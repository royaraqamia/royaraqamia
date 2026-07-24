'use client';

import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
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
  ExternalLink,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  deletePost,
  unpublishPost,
  publishPost,
  createPost,
} from '@/domains/blogpress/lib/actions/posts';
import type { Post, PostStatus } from '@/domains/blogpress/lib/definitions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PostListProps {
  posts: Post[];
}

const filters: { label: string; value: PostStatus | 'all' }[] = [
  { label: 'الكل', value: 'all' },
  { label: 'مسودة', value: 'draft' },
  { label: 'منشور', value: 'published' },
];

function estimateWordCount(content: string | null): number {
  if (!content) return 0;
  const text = content.replace(/[#*_`~>[\]!|-]/g, '').trim();
  return text.split(/\s+/).filter(Boolean).length;
}

function estimateReadingTime(content: string | null): number {
  return Math.max(1, Math.ceil(estimateWordCount(content) / 180));
}

export function PostList({ posts }: PostListProps) {
  const [activeFilter, setActiveFilter] = useState<PostStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pending, startTransition] = useTransition();

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

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div
          className="flex items-center gap-0.5 border-b border-border/50"
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
                'px-3.5 py-2.5 text-sm border-b-2 transition-smooth -mb-px rounded-t-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[44px]',
                activeFilter === f.value
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {f.label}
              {f.value !== 'all' && (
                <span className="me-1.5 text-xs text-muted-foreground">
                  ({posts.filter((p) => p.status === f.value).length})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative sm:mr-auto sm:min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في المقالات..."
            className="w-full h-9 pr-9 pl-3 rounded-lg bg-muted/50 border border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-xs placeholder:text-muted-foreground/40 outline-none transition-all"
          />
        </div>
      </div>

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
                  ? 'أنشئ مقالك الأول للبدء في الكتابة.'
                  : 'لا توجد مقالات في هذا التصنيف.'}
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <Button
                className="mt-5 transition-smooth shadow-sm hover:shadow-md rounded-xl"
                disabled={pending}
                onClick={() => startTransition(() => createPost())}
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
          <div className="size-12 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center ring-1 ring-border/50">
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
            {wordCount.toLocaleString('ar')} كلمة &middot; {readingTime} د
          </span>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-xs text-muted-foreground/60">
            {post.status === 'published'
              ? `نُشر ${post.published_at ? format(new Date(post.published_at), 'yyyy/MM/dd') : ''}`
              : `آخر تعديل ${format(new Date(post.updated_at), 'yyyy/MM/dd')}`}
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
          {post.status === 'published' ? 'منشور' : 'مسودة'}
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
          <DropdownMenuContent align="end" className="min-w-[160px]">
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
                    toast.error('فشل إلغاء النشر');
                  }
                }}
                className="cursor-pointer"
              >
                <EyeOff className="ms-2 size-4" />
                إلغاء النشر
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
                    هل أنت متأكد من حذف &ldquo;{post.title || 'بدون عنوان'}&rdquo;؟ لا يمكن التراجع
                    عن هذا الإجراء.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2">
                  <DialogTrigger asChild>
                    <Button variant="outline" type="button" className="rounded-xl">
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
                      className="rounded-xl"
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
