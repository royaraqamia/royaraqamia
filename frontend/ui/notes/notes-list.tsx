'use client';

import { FilePlus2, Search, X } from 'lucide-react';

import type { Note } from '@/shared/contracts/notes';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { notePreview } from '@/frontend/shared/notes/text';
import { Button } from '@/frontend/ui/primitives/button';
import { cn } from '@/frontend/shared/cn';

interface NotesListProps {
  notes: Note[];
  selectedId: string | null;
  query: string;
  canCreate: boolean;
  onSelect: (id: string) => void;
  onQueryChange: (query: string) => void;
  onCreate: () => void;
}

/**
 * The list half of the master-detail surface: search, the create action, and
 * one row per live note, newest edit first. A row is the whole selection target;
 * delete lives in the editor so a thumb cannot miss it and lose a note.
 */
export function NotesList({
  notes,
  selectedId,
  query,
  canCreate,
  onSelect,
  onQueryChange,
  onCreate,
}: NotesListProps) {
  return (
    <section
      aria-label="قائمة الملاحظات"
      className="flex min-h-0 flex-col rounded-3xl border border-border/60 bg-card/60"
    >
      <div className="space-y-3 border-b border-border/50 p-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="ابحث في ملاحظاتك…"
              aria-label="ابحث في الملاحظات"
              className="h-10 w-full rounded-full border border-input/70 bg-background/70 ps-9 pe-9 text-sm outline-none transition-safe focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            {query !== '' && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label="مسح البحث"
                className="absolute inset-y-0 end-2 my-auto flex size-7 items-center justify-center rounded-full text-muted-foreground transition-safe hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>

          <Button
            type="button"
            size="icon-sm"
            id="btn-new-note"
            onClick={onCreate}
            disabled={!canCreate}
            aria-label="ملاحظة جديدة"
            title={canCreate ? 'ملاحظة جديدة' : 'بلغتَ الحدّ الأعلى للخطة الحالية'}
            className="shrink-0"
          >
            <FilePlus2 aria-hidden="true" />
          </Button>
        </div>
        <p className="px-1 text-[11px] font-medium text-muted-foreground">
          عدد الملاحظات: {notes.length}
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-bold text-foreground">
            {query === '' ? 'لا ملاحظات بعد' : 'لا نتائج للبحث'}
          </p>
          <p className="max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
            {query === ''
              ? 'اكتب أول ملاحظة، وستُحفظ على هذا الجهاز حتى بلا اتِّصال.'
              : 'جرِّب كلمة أخرى، أو امسح البحث لعرض كل الملاحظات.'}
          </p>
          {query === '' && canCreate && (
            <Button type="button" size="sm" variant="outline" onClick={onCreate}>
              <FilePlus2 aria-hidden="true" />
              ملاحظة جديدة
            </Button>
          )}
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
