'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { BlogResults } from './blog-results';

interface BlogIndexResultsProps {
  children: ReactNode;
}

interface IndexData {
  posts: PostSummary[];
  totalPages: number;
}

/**
 * Client island for the static `/blog` page.
 *
 * The page itself is statically prerendered (ISR) with the default page-1 grid
 * passed as `children`. This island only becomes active when the URL carries
 * search params (`?q=` / `?page=`) — it fetches the matching results from
 * `/api/blog/index` and renders them. The default view keeps its server HTML.
 */
export function BlogIndexResults({ children }: BlogIndexResultsProps) {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const query = searchParams.get('q')?.trim() ?? '';
  const isDefault = page === 1 && !query;

  const [data, setData] = useState<IndexData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isDefault) {
      setData(null);
      setIsLoading(false);
      return;
    }
    let ignore = false;
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (query) params.set('q', query);
    fetch(`/api/blog/index?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('failed to load blog index');
        return res.json() as Promise<IndexData>;
      })
      .then((json) => {
        if (!ignore) {
          setData(json);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [page, query, isDefault]);

  if (isDefault) return <>{children}</>;

  if (isLoading || !data) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-3xl border border-border bg-muted/20 overflow-hidden animate-pulse"
          >
            <div className="aspect-16/10 w-full bg-muted/60" />
            <div className="p-6 sm:p-7 space-y-3">
              <div className="h-5 w-3/4 rounded-full bg-muted/70" />
              <div className="h-3.5 w-full rounded-full bg-muted/50" />
              <div className="h-3.5 w-2/3 rounded-full bg-muted/50" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <BlogResults posts={data.posts} totalPages={data.totalPages} page={page} query={query} />;
}
