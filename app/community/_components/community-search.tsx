'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export function CommunitySearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const query = searchParams.get('q') ?? '';
  const [value, setValue] = useState(query);

  // Keep the field in step with the URL (back/forward, external links).
  useEffect(() => {
    setValue(query);
  }, [query]);

  const pushQuery = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set('q', next);
      } else {
        params.delete('q');
      }
      params.delete('cursor');
      router.push(`/community?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setValue(next);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => pushQuery(next.trim()), 350);
    },
    [pushQuery]
  );

  const handleClear = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setValue('');
    pushQuery('');
  }, [pushQuery]);

  return (
    <div className="relative">
      <Search className="absolute inset-e-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="ابحث في المقالات..."
        aria-label="ابحث في المقالات"
        className="w-full h-11 pr-10 pl-10 rounded-xl bg-background/60 border border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-sm placeholder:text-muted-foreground/40 outline-none transition-safe"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute inset-s-3 top-1/2 -translate-y-1/2 size-6 flex items-center justify-center rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 text-muted-foreground transition-colors cursor-pointer"
          aria-label="إلغاء البحث"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
