'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { NotebookPen, PenLine } from 'lucide-react';
import { toast } from 'sonner';

import type { Note } from '@/shared/contracts/notes';
import { noteSearchText, normalizeForSearch } from '@/frontend/shared/notes/text';
import { useNotes } from '@/frontend/state/notes/use-notes';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SyncStatusPill } from '@/frontend/ui/shared/sync-status-pill';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import { showActionError } from '@/frontend/ui/plans/show-plan-error';
import { NotesList } from './notes-list';

/**
 * The editor is the heavy half (Tiptap), and a visitor can read the list without
 * ever opening a note, so it arrives as its own chunk. A chunk that cannot be
 * fetched renders nothing rather than taking the page down with it.
 */
const NoteEditor = dynamic(
  tolerateChunkFailure('note editor', () =>
    import('./note-editor').then((module) => ({ default: module.NoteEditor }))
  ),
  {
    ssr: false,
    loading: () => (
      <div
        className="space-y-4 rounded-3xl border border-border/60 bg-card/60 p-5"
        aria-busy="true"
      >
        <div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-4 w-full animate-pulse rounded-lg bg-muted/30" />
        <div className="h-4 w-5/6 animate-pulse rounded-lg bg-muted/30" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-muted/20" />
      </div>
    ),
  }
);

function NotesSkeleton() {
  return (
    <div
      className="grid gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]"
      data-local-store-skeleton="true"
      aria-busy="true"
      aria-label="جاري فتح التَّخزين المحلِّي"
    >
      <div className="h-96 animate-pulse rounded-3xl border border-border/40 bg-muted/30" />
      <div className="h-96 animate-pulse rounded-3xl border border-border/40 bg-muted/20" />
    </div>
  );
}

export function NotesPageClient() {
  return (
    <>
      <header className="mb-8 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>المُلاحظات</SectionTitleHighlight>
        </SectionTitle>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          دفترك السَّريع: اكتب، نسِّق، وابحث. كلُّ شيء يُحفظ على جهازك أوَّلًا، ويُزامَن تلقائيًّا
          إذا سجَّلت الدُّخول.
        </p>
      </header>

      <Suspense fallback={<NotesSkeleton />}>
        <NotesContent />
      </Suspense>
    </>
  );
}

function NotesContent() {
  const {
    ready,
    online,
    isSignedIn,
    store,
    notes,
    syncing,
    pending,
    failed,
    lastError,
    lastFailedType,
    retry,
  } = useNotes();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const initialised = useRef(false);

  // The open note is view state in the URL, read once on arrival: a shared link
  // or a reload lands on the same note without making the shell dynamic.
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    setSelectedId(searchParams.get('note'));
  }, [searchParams]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (typeof window === 'undefined') return;
    const url = id ? `/notes?note=${encodeURIComponent(id)}` : '/notes';
    // `replaceState` rather than the router: the document is a static shell, so a
    // navigation would ask the network for a page it already has — and fail
    // offline, which is the one state this surface is built for.
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const handleCreate = useCallback(() => {
    if (!store) return;
    void store
      .createNote()
      .then((note) => {
        setQuery('');
        select(note.id);
      })
      .catch((error) => {
        showActionError(error, 'تعذّر إنشاء الملاحظة');
      });
  }, [select, store]);

  const handleDelete = useCallback(
    (note: Note) => {
      if (!store) return;
      const deletedTitle = note.title.trim() || 'بدون عنوان';
      void store.deleteNote(note.id).then((removed) => {
        if (!removed) return;
        select(null);
        toast(`حُذفت «${deletedTitle}»`, {
          duration: 8000,
          action: {
            label: 'تراجع',
            onClick: () => {
              void store.restoreNote(note.id).then((restored) => {
                if (restored) select(note.id);
              });
            },
          },
        });
      });
    },
    [select, store]
  );

  const filtered = useMemo(() => {
    const needle = normalizeForSearch(query.trim());
    if (needle === '') return notes;
    return notes.filter((note) => noteSearchText(note).includes(needle));
  }, [notes, query]);

  const selected = useMemo(
    () => (selectedId ? (notes.find((note) => note.id === selectedId) ?? null) : null),
    [notes, selectedId]
  );

  return (
    <div className="space-y-4" data-notes-ready={ready ? 'true' : 'false'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {!isSignedIn
            ? 'تُحفظ ملاحظاتك على هذا الجهاز. سجِّل الدُّخول لتُزامَن مع أجهزتك الأخرى.'
            : online
              ? 'تعديلاتك تصل إلى حسابك حين تكون متَّصلًا.'
              : 'غير متَّصل — كلُّ ما تكتبه محفوظ على هذا الجهاز.'}
        </p>
        <SyncStatusPill
          status={{
            syncing,
            pending,
            failed,
            online,
            retry,
            lastError,
            lastFailedType,
          }}
        />
      </div>

      {!ready || !store ? (
        <NotesSkeleton />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
          <div className={selected ? 'hidden lg:block' : ''}>
            <NotesList
              notes={filtered}
              selectedId={selectedId}
              query={query}
              canCreate={ready}
              onSelect={select}
              onQueryChange={setQuery}
              onCreate={handleCreate}
            />
          </div>

          <div className={selected ? '' : 'hidden lg:block'}>
            {selected ? (
              <NoteEditor
                key={selected.id}
                note={selected}
                store={store}
                onBack={() => select(null)}
                onDelete={() => handleDelete(selected)}
              />
            ) : (
              <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/70 bg-card/30 p-8 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <NotebookPen aria-hidden="true" className="size-7" />
                </div>
                <p className="text-sm font-bold">اختر ملاحظة أو أنشئ واحدة</p>
                <p className="max-w-[32ch] text-xs leading-relaxed text-muted-foreground">
                  الملاحظات تعمل بلا اتِّصال، وتظهر على أجهزتك الأخرى بعد تسجيل الدُّخول.
                </p>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="mt-1 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary transition-safe hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <PenLine aria-hidden="true" className="size-4" />
                  ملاحظة جديدة
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
