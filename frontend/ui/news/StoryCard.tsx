import { ArrowUpLeft } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { NEWS_CATEGORY_ICONS, NEWS_CATEGORY_TONES, formatRelativeTime } from './news-format';
import {
  NEWS_CATEGORY_LABELS,
  NEWS_REGION_LABELS,
  formatDigestDayShort,
  type NewsSearchHit,
  type NewsStory,
} from '@/shared/contracts/news';

interface StoryCardProps {
  story: NewsStory | NewsSearchHit;
  /** Set on search results so every hit says which day it came from. */
  digestDate?: string;
  /** The digest's own numbering; search results carry none. */
  showPosition?: boolean;
}

function isSearchHit(story: NewsStory | NewsSearchHit): story is NewsSearchHit {
  return 'digestDate' in story;
}

/**
 * One story in the digest.
 *
 * The card is a plain server component: nothing here is interactive beyond the
 * outbound link, so nothing needs to ship to the client. The summary is the
 * model's Arabic text as published — the page never rewrites it, and the source
 * link is the reader's way back to the original.
 */
export function StoryCard({ story, digestDate, showPosition = true }: StoryCardProps) {
  const CategoryIcon = NEWS_CATEGORY_ICONS[story.category];
  const relative = formatRelativeTime(story.sourcePublishedAt);
  const day = digestDate ?? (isSearchHit(story) ? story.digestDate : undefined);

  return (
    <article className="cv-auto group rounded-2xl border border-border/60 bg-card/85 p-5 shadow-sm transition-colors hover:border-border">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold',
            NEWS_CATEGORY_TONES[story.category]
          )}
        >
          <CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {NEWS_CATEGORY_LABELS[story.category]}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {NEWS_REGION_LABELS[story.region]}
        </span>
        {showPosition ? (
          <span className="ms-auto rounded-lg border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {story.position}
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 text-lg font-extrabold leading-snug text-foreground">{story.headline}</h3>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{story.summary}</p>

      {story.whyItMatters ? (
        <p className="mt-3 rounded-xl border border-border/50 bg-muted/50 px-3 py-2 text-xs leading-6 text-foreground/80">
          <span className="font-bold">لماذا يهم: </span>
          {story.whyItMatters}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-bold text-foreground/80">{story.sourceName}</span>
        {relative ? <span>· {relative}</span> : null}
        {day ? <span>· {formatDigestDayShort(day)}</span> : null}
        <a
          href={story.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`فتح المصدر الأصلي: ${story.sourceName}`}
          className="ms-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          المصدر
          <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
