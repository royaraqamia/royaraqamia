'use client';

import { ExternalLink } from 'lucide-react';

import { ASSISTANT_PANEL_COPY } from '@/frontend/ui/assistant/assistant-panel-copy';
import type { WebSource } from '@/shared/contracts/web-search';

/**
 * What a web answer was read from (ADR-0206).
 *
 * The numbers are the ones the model was given in the evidence, so `[1]` in the
 * reply is `[1]` here. The row is the anchor the inline marker points at; the
 * card itself stays small because the answer is the member's reading, not the
 * list of pages behind it.
 */
export function WebSources({
  sources,
  anchorPrefix,
  readNote = false,
}: {
  sources: WebSource[] | null | undefined;
  /** Unique on the page: a stream and every stored row get their own anchors. */
  anchorPrefix: string;
  /** The reply cited nothing in its text, so say what these rows are. */
  readNote?: boolean;
}) {
  if (!sources || sources.length === 0) return null;

  return (
    <section
      className="mt-2 w-full max-w-[85%] rounded-xl border border-border/60 bg-background/40 px-2.5 py-2 text-[11px]"
      aria-label={ASSISTANT_PANEL_COPY.sourcesTitle}
    >
      <h4 className="mb-1 font-semibold text-foreground/80">{ASSISTANT_PANEL_COPY.sourcesTitle}</h4>
      {readNote ? (
        <p className="mb-1 italic opacity-70">{ASSISTANT_PANEL_COPY.sourcesRead}</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {sources.map((source, at) => (
          <li key={`${source.url}-${at}`} id={`${anchorPrefix}-${at + 1}`}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              dir="auto"
              className="inline-flex max-w-full items-start gap-1 text-foreground/90 underline underline-offset-2"
            >
              <span dir="ltr" className="font-mono opacity-70">
                [{at + 1}]
              </span>
              <span className="min-w-0 break-words">{source.title || source.domain}</span>
              <ExternalLink size={11} className="mt-0.5 shrink-0 opacity-60" aria-hidden="true" />
            </a>
            <span className="block truncate opacity-60" dir="ltr">
              {source.domain}
              {displayDate(source.publishedDate) ? ` · ${displayDate(source.publishedDate)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The vendor's date is prose; the card shows an ASCII day, not a locale guess. */
function displayDate(publishedDate: string | null): string | null {
  if (!publishedDate) return null;
  const date = new Date(publishedDate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
