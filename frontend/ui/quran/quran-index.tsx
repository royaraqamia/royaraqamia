import Link from 'next/link';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { ReadingPanel } from './reading-panel';
import { revelationLabel } from './format';
import type { QuranIndex } from '@/shared/contracts/quran';

/**
 * The sura index: all 114, in the order of the text.
 *
 * A server component with no interactivity on purpose — the list is static, so
 * it renders as HTML and needs no client bundle. Filtering by name is a
 * separate concern from searching the text (P4) and is not part of this.
 *
 * The one interactive piece is `ReadingPanel`, which shows a returning reader
 * where they stopped; nothing else here depends on it.
 */
export function QuranIndexPage({ index }: { index: QuranIndex }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header className="flex flex-col items-center gap-3 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>القرآن الكريم</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <ReadingPanel names={index.surahs.map((surah) => surah.name)} />

      <nav aria-label="فهرس السُّوَر" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {index.surahs.map((surah) => (
          <Link
            key={surah.n}
            href={`/quran/${surah.n}`}
            className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 transition-safe hover:border-border/90 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-heading text-sm font-bold text-primary transition-colors group-hover:bg-primary/15"
            >
              {surah.n}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-bold text-foreground transition-colors group-hover:text-primary">
                {surah.name}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {revelationLabel(surah.revelation)} ·{' '}
                <span className="font-heading">{surah.ayahCount}</span> آيات
              </span>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
