'use client';

import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/frontend/shared/cn';
import { PopoverContent } from '@/frontend/ui/primitives/popover';
import {
  EMOJI_BY_GLYPH,
  EMOJI_CATALOG,
  EMOJI_CATEGORIES,
  searchEmoji,
  type ChatEmojiLabels,
  type EmojiCategory,
  type EmojiEntry,
} from './emoji-catalog';

/** Where the last-used glyphs are kept: the device, not the account. */
export const EMOJI_RECENT_STORAGE_KEY = 'roya-chat-emoji-recent';

/** How many glyphs the recent tab keeps. Two rows of eight. */
const RECENT_MAX = 16;

type Tab = 'recent' | EmojiCategory;

/**
 * The emoji sheet a message or a comment opens, over the field the chat
 * composer and the comment row share.
 *
 * It is a chunk of its own: the field draws a 16px smiley and nothing else
 * loads, so a conversation nobody decorates never pays for the catalog. The
 * panel arrives above the field on a desktop and as the site's bottom sheet on
 * a phone — the same `PopoverContent` every other floating surface uses.
 *
 * Picking writes at the caret and leaves the sheet open, so a member can put
 * three hearts in a row; the search box keeps the keyboard, which is what stops
 * a phone from raising the alphabet keyboard over the sheet it just opened.
 */
export function EmojiPickerPanel({
  labels,
  onPick,
}: {
  labels: ChatEmojiLabels;
  onPick: (glyph: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('smileys');

  // A returning member lands on their own last glyphs; a first one on the faces.
  useEffect(() => {
    const stored = readRecent();
    setRecent(stored);
    if (stored.length > 0) setTab('recent');
  }, []);

  const results = useMemo(() => (query.trim() ? searchEmoji(query) : null), [query]);

  function pick(glyph: string) {
    onPick(glyph);
    setRecent((current) => {
      const next = [glyph, ...current.filter((item) => item !== glyph)].slice(0, RECENT_MAX);
      try {
        window.localStorage.setItem(EMOJI_RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // A device that refuses storage still gets the picker; the list is a
        // convenience, so a full quota is not a reason to fail a send.
      }
      return next;
    });
  }

  const entries: readonly EmojiEntry[] =
    results ??
    (tab === 'recent'
      ? recent.flatMap((glyph) => {
          const entry = EMOJI_BY_GLYPH.get(glyph);
          return entry ? [entry] : [];
        })
      : EMOJI_CATALOG[tab]);

  const categoryLabel = (category: Tab) =>
    category === 'recent' ? labels.recent : labels.categories[category];

  return (
    <PopoverContent
      side="top"
      align="end"
      aria-label={labels.open}
      className="w-[21rem] p-0 max-sm:p-0 sm:w-[21rem] sm:p-0"
    >
      <div className="flex max-h-[min(22rem,60dvh)] flex-col">
        <div className="border-b border-border/60 p-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
            autoComplete="off"
            enterKeyHint="search"
            className="h-9 w-full rounded-lg border border-border/70 bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
          />
        </div>

        {query.trim() ? null : (
          <div
            role="tablist"
            aria-label={labels.open}
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 px-2 py-1.5"
          >
            {(['recent', ...EMOJI_CATEGORIES] as const).map((category) => {
              // An empty recent tab is a dead end on the first open.
              if (category === 'recent' && recent.length === 0) return null;
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={tab === category}
                  onClick={() => setTab(category)}
                  className={cn(
                    'shrink-0 rounded-full px-2 py-1 text-[11px] font-medium transition-colors',
                    tab === category
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  {categoryLabel(category)}
                </button>
              );
            })}
          </div>
        )}

        <div className="min-h-24 flex-1 overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {labels.noResults}
            </p>
          ) : (
            <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-9">
              {entries.map(([glyph, arabic]) => (
                <button
                  key={glyph}
                  type="button"
                  aria-label={arabic}
                  onClick={() => pick(glyph)}
                  className="flex size-9 items-center justify-center rounded-lg text-xl leading-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <span aria-hidden="true">{glyph}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </PopoverContent>
  );
}

/** The stored glyphs, or none when the device refuses to say. */
function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(EMOJI_RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}
