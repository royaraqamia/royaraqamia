import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';

interface PaginationProps {
  page: number;
  totalPages: number;
  query: string;
}

export function Pagination({ page, totalPages, query }: PaginationProps) {
  const pages: (number | 'ellipsis')[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('ellipsis');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
  }

  return (
    <nav
      aria-label="تنقُّل بين الصَّفحات"
      className="flex flex-wrap items-center justify-center gap-2 mt-16 sm:mt-20"
    >
      {page > 1 && (
        <Link
          href={`/blog?page=${page - 1}${query ? `&q=${query}` : ''}`}
          aria-label="الصَّفحة السَّابقة"
        >
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-full border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/70 hover:border-border transition-all duration-200"
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        </Link>
      )}

      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span
            key={`e${i}`}
            className="px-2 text-muted-foreground text-sm tracking-widest select-none"
          >
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={`/blog?page=${p}${query ? `&q=${query}` : ''}`}
            aria-label={`الصَّفحة ${p}`}
            aria-current={p === page ? 'page' : undefined}
          >
            <Button
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className={`size-10 rounded-full transition-all duration-300 text-sm font-bold ${
                p === page
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-105 border-transparent'
                  : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/70 hover:border-border'
              }`}
            >
              {p}
            </Button>
          </Link>
        )
      )}

      {page < totalPages && (
        <Link
          href={`/blog?page=${page + 1}${query ? `&q=${query}` : ''}`}
          aria-label="الصَّفحة التَّالية"
        >
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-full border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/70 hover:border-border transition-all duration-200"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Button>
        </Link>
      )}
    </nav>
  );
}
