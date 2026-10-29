'use client';

import { Search, X } from 'lucide-react';

import type { Note } from '@/shared/contracts/notes';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { notePreview } from '@/frontend/shared/notes/text';
import { cn } from '@/frontend/shared/cn';

interface NotesListProps {
  notes: Note[];
  selectedId: string | null;
  query: string;
  onSelect: (id: string) => void;
  onQueryChange: (query: string) => void;
}

/**
 * The list half of the master-detail surface: search and one row per live note,
 * newest edit first. A row is the whole selection target; create lives on the
 * page's FAB and delete lives in the editor, so a thumb cannot miss either.
 *
 * The search field is the community/news one, down to the class names. Those
 * ask a server, so they commit on Enter; this list is already in memory, so the
 * filter runs on every keystroke — the same field, minus a round trip.
 */
export function NotesList({ notes, selectedId, query, onSelect, onQueryChange }: NotesListProps) {
  return (
    <section
      aria-label="قائمة الملاحظات"
      className="flex flex-col rounded-3xl border border-border/60 bg-card/60"
    >
      <div className="border-b border-border/50 p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-s-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onQueryChange('');
            }}
            placeholder="ابحث في ملاحظاتك…"
            aria-label="ابحث في الملاحظات"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-border/50 bg-background/60 ps-10 pe-10 text-sm outline-none transition-safe placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          {query !== '' && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute inset-e-3 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground transition-colors hover:bg-muted-foreground/30"
              aria-label="إلغاء البحث"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-bold text-foreground">
            {query === '' ? 'لا ملاحظات بعد' : 'لا نتائج للبحث'}
          </p>
          <p className="max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
            {query === ''
              ? 'اكتب أول ملاحظة، وستُحفظ على هذا الجهاز حتى بلا اتِّصال.'
              : 'جرِّب كلمة أخرى، أو امسح البحث لعرض كل الملاحظات.'}
          </p>
        </div>
      ) : (
        <ul role="list" className="min-h-0 flex-1 overflow-y-auto p-2">
          {notes.map((note) => {
            const selected = note.id === selectedId;
            const title = note.title.trim() || 'بدون عنوان';
            const preview = notePreview(note.body, 90);

            return (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onSelect(note.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-2xl px-3 py-2.5 text-start transition-safe hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    selected && 'bg-primary/10 ring-1 ring-primary/25'
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {calculateTimeAgo(note.updatedAt)}
                    </span>
                  </span>
                  {preview !== '' && (
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                      {preview}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
