import { ArrowUpLeft } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { NEWS_CATEGORY_ICONS, NEWS_CATEGORY_TONES, formatRelativeTime } from './news-format';
import { NEWS_STORY_COPY } from './news-story-copy';
import {
  formatDigestDayShort,
  type NewsCategory,
  type NewsRegion,
  type NewsSearchHit,
  type NewsStory,
} from '@/shared/contracts/news';

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  tech: NEWS_STORY_COPY.categoryTech,
  politics: NEWS_STORY_COPY.categoryPolitics,
  religion: NEWS_STORY_COPY.categoryReligion,
  economy: NEWS_STORY_COPY.categoryEconomy,
  world: NEWS_STORY_COPY.categoryWorld,
  other: NEWS_STORY_COPY.categoryOther,
};

const REGION_LABELS: Record<NewsRegion, string> = {
  arab: NEWS_STORY_COPY.regionArab,
  islamic: NEWS_STORY_COPY.regionIslamic,
  world: NEWS_STORY_COPY.regionWorld,
};

interface StoryCardProps {
  story: NewsStory | NewsSearchHit;
  /** Set on search results so every hit says which day it came from. */
  digestDate?: string;
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
 *
 * One field the digest still carries is deliberately not drawn: `whyItMatters`.
 * Two paragraphs of commentary on every card made the digest long enough that a
 * reader scrolled past the stories themselves; the column and the generator keep
 * producing it, so nothing downstream has to change when it comes back.
 */
export function StoryCard({ story, digestDate }: StoryCardProps) {
  const CategoryIcon = NEWS_CATEGORY_ICONS[story.category];
  const relative = formatRelativeTime(story.sourcePublishedAt);
  const day = digestDate ?? (isSearchHit(story) ? story.digestDate : undefined);

  return (
    <article
      data-visual="news-story"
      className="cv-auto group rounded-2xl border border-border/60 bg-card/85 p-5 shadow-sm transition-colors hover:border-border"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold',
            NEWS_CATEGORY_TONES[story.category]
          )}
        >
          <CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {CATEGORY_LABELS[story.category]}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {REGION_LABELS[story.region]}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-extrabold leading-snug text-foreground">{story.headline}</h3>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{story.summary}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-bold text-foreground/80">{story.sourceName}</span>
        {relative ? <span>· {relative}</span> : null}
        {day ? <span>· {formatDigestDayShort(day)}</span> : null}
        <a
          href={story.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-visual="news-story-source"
          aria-label={NEWS_STORY_COPY.sourceAria.replace('{sourceName}', story.sourceName)}
          className="ms-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {NEWS_STORY_COPY.source}
          <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
