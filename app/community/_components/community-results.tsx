import Link from 'next/link';
import { FileText, Search, X } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { PostCard } from './post-card';
import { LoadMore } from './load-more';

interface CommunityResultsProps {
  posts: PostSummary[];
  nextCursor: string | null;
  query: string;
  onLoadMore: () => void;
  isLoadingMore: boolean;
}

export function CommunityResults({
  posts,
  nextCursor,
  query,
  onLoadMore,
  isLoadingMore,
}: CommunityResultsProps) {
  return (
    <>
      {query && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 mb-10 rounded-2xl bg-muted/20 border border-border text-sm text-muted-foreground shadow-sm">
          <div className="flex items-center gap-2.5">
            <Search className="size-4 text-primary shrink-0" />
            <span>نتائج البحث عن:</span>
            <span className="px-3 py-1 rounded-lg bg-primary/15 border border-primary/30 text-primary font-bold text-xs">
              &ldquo;{query}&rdquo;
            </span>
          </div>
          <Link
            href="/community"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 border-b border-border hover:border-foreground pb-0.5"
          >
            <X className="size-3.5" />
            إلغاء التَّصفية
          </Link>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border border-border bg-muted/20 py-24 px-6 flex flex-col items-center justify-center text-center my-8 shadow-2xl">
          <div className="size-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mb-6 shadow-inner text-muted-foreground">
            <FileText className="size-8 stroke-[1.5]" />
          </div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-2">
            {query ? 'لا توجد نتائج للبحث' : 'لا توجد مقالات بعد'}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md mb-8 leading-relaxed">
            {query
              ? 'لم نعثر على مقالات تُطابق بحثك. جرِّب كلمات بحث مختلفة.'
              : 'لا توجد مقالات منشورة حاليًّا. عد لاحقًا لقراءة أحدث المحتوى والمقالات.'}
          </p>
          {query && (
            <Link href="/community">
              <Button
                variant="outline"
                className="rounded-full bg-muted/50 border-border text-foreground hover:bg-muted/70 hover:border-border transition-safe duration-300 px-6"
              >
                عرض جميع المقالات
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
            {posts.map((post, index) => (
              <PostCard key={post.id} post={post} index={index} />
            ))}
          </div>

          {nextCursor && (
            <LoadMore
              cursor={nextCursor}
              query={query}
              isLoading={isLoadingMore}
              onLoadMore={onLoadMore}
            />
          )}
        </>
      )}
    </>
  );
}
