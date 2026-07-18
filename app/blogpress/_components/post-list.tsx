'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
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

export function PostList({ posts }: PostListProps) {
  const [activeFilter, setActiveFilter] = useState<PostStatus | 'all'>('all');
  const [pending, startTransition] = useTransition();

  const filteredPosts =
    activeFilter === 'all' ? posts : posts.filter((p) => p.status === activeFilter);

  return (
    <div>
      <div className="flex items-center gap-0.5 mb-5 border-b border-border/50">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={cn(
              'px-3.5 py-2.5 text-sm border-b-2 transition-smooth -mb-px rounded-t-lg',
              activeFilter === f.value
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {f.label}
            {f.value !== 'all' && (
              <span className="mr-1.5 text-xs text-muted-foreground">
                ({posts.filter((p) => p.status === f.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border/50">
        {filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mb-5">
              <FileText className="size-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold">لا توجد مقالات بعد</h3>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
              {activeFilter === 'all'
                ? 'أنشئ مقالك الأول للبدء في الكتابة.'
                : 'لا توجد مقالات في هذا التصنيف.'}
            </p>
            {activeFilter === 'all' && (
              <Button
                className="mt-5 transition-smooth shadow-sm hover:shadow-md"
                disabled={pending}
                onClick={() => startTransition(() => createPost())}
              >
                {pending ? (
                  <Loader2 className="ml-2 size-4 animate-spin" />
                ) : (
                  <Plus className="ml-2 size-4" />
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

  return (
    <div className="flex items-center gap-4 py-4 transition-smooth hover:bg-muted/30 -mx-2 px-2 rounded-lg">
      <div className="flex-1 min-w-0">
        <Link
          href={`/blogpress/editor/${post.id}`}
          className="text-sm font-medium hover:text-primary transition-smooth truncate block"
        >
          {post.title || 'بدون عنوان'}
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5">
          /{post.slug} &middot;{' '}
          {post.status === 'published'
            ? `نُشر في ${post.published_at ? format(new Date(post.published_at), 'yyyy/MM/dd') : ''}`
            : `مسودة - آخر تعديل ${format(new Date(post.updated_at), 'yyyy/MM/dd')}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            post.status === 'published'
              ? 'bg-success/10 text-success dark:bg-success/30 dark:text-success'
              : 'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning'
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
          <DropdownMenuContent align="end" className="transition-smooth">
            <DropdownMenuItem asChild>
              <Link href={`/blogpress/editor/${post.id}`} className="transition-smooth">
                <PenLine className="ml-2 size-4" />
                تعديل
              </Link>
            </DropdownMenuItem>
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
                className="transition-smooth"
              >
                <Eye className="ml-2 size-4" />
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
                className="transition-smooth"
              >
                <EyeOff className="ml-2 size-4" />
                إلغاء النشر
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <Dialog>
              <DialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="transition-smooth"
                >
                  <Trash2 className="ml-2 size-4 text-destructive" />
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
                    <Button variant="outline" type="button" className="transition-smooth">
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
                      className="transition-smooth"
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
