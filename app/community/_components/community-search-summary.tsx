import Link from 'next/link';
import { Search, X } from 'lucide-react';

interface CommunitySearchSummaryProps {
  /** The query the visible rows answer. */
  query: string;
}

/**
 * The line that says the feed is a search result rather than the whole feed.
 *
 * It sits above the results but is not part of them: the results component owns
 * the list, the empty state and the failure faces, and the app ports those. The
 * search bar's words are still the site's own until the app draws a search
 * control (#658), so they live here rather than in a copy source no second
 * client reads.
 */
export function CommunitySearchSummary({ query }: CommunitySearchSummaryProps) {
  return (
    <div
      data-visual="community-summary"
      className="flex flex-wrap items-center justify-between gap-4 p-4 mb-10 rounded-2xl bg-muted/20 border border-border text-sm text-muted-foreground shadow-sm"
    >
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
        إلغاء التَّصفية
      </Link>
    </div>
  );
}
