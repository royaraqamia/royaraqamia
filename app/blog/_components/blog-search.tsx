'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';

export function BlogSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const value = e.target.value.trim();
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
          params.set('q', value);
        } else {
          params.delete('q');
        }
        params.delete('page');
        router.push(`/blog?${params.toString()}`);
      }, 350);
    },
    [router, searchParams]
  );

  const handleClear = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    params.delete('page');
    router.push(`/blog?${params.toString()}`);
  }, [router, searchParams]);

  const query = searchParams.get('q') ?? '';

  return (
    <div className="relative">
      <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 pointer-events-none" />
      <input
        type="text"
        defaultValue={query}
        onChange={handleChange}
        placeholder="ابحث في المقالات..."
        className="w-full h-11 pr-10 pl-10 rounded-xl bg-background/60 border border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-sm placeholder:text-muted-foreground/40 outline-none transition-all"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute left-3 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 text-muted-foreground transition-colors"
          aria-label="إلغاء البحث"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
