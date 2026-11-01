'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { FilePlus2 } from 'lucide-react';
import { toast } from 'sonner';

import type { Note } from '@/shared/contracts/notes';
import { noteName, noteSearchText, normalizeForSearch } from '@/frontend/shared/notes/text';
import { useNotes } from '@/frontend/state/notes/use-notes';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SyncStatusPill } from '@/frontend/ui/shared/sync-status-pill';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import { showActionError } from '@/frontend/ui/plans/show-plan-error';
import { FabButton } from '@/frontend/ui/shared/fab-button';
import { NotesList } from './notes-list';

/**
 * Both dialogs carry the rich-text editor (Tiptap), and a visitor can read the
 * list without ever opening a note, so they arrive as their own chunk. A chunk
 * that cannot be fetched renders nothing rather than taking the page down with
 * it.
 */
const NoteComposerDialog = dynamic(
  tolerateChunkFailure('note composer', () =>
    import('./note-composer-dialog').then((module) => ({ default: module.NoteComposerDialog }))
  ),
  { ssr: false }
);

const NoteEditorDialog = dynamic(
  tolerateChunkFailure('note editor', () =>
    import('./note-editor-dialog').then((module) => ({ default: module.NoteEditorDialog }))
  ),
  { ssr: false }
);

function NotesSkeleton() {
  return (
    <div
      className="h-96 animate-pulse rounded-3xl border border-border/40 bg-muted/30"
      data-local-store-skeleton="true"
      aria-busy="true"
      aria-label="جاري فتح التَّخزين المحلِّي"
    />
  );
}

export function NotesPageClient() {
  return (
    <>
      <header className="mb-8 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>الملاحظات</SectionTitleHighlight>
        </SectionTitle>
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
  const [composerOpen, setComposerOpen] = useState(false);
  const initialised = useRef(false);

  // The open note is view state in the URL, read once on arrival: a shared link
  // or a reload opens the same note without making the shell dynamic.
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

  const handleCreate = useCallback(
    async (input: { body: string }) => {
      if (!store) return;
      try {
        const note = await store.createNote(input);
        setQuery('');
        select(note.id);
      } catch (error) {
        // The composer keeps the draft open; the plan refusal (or any other
        // failure) is named here rather than swallowed.
        showActionError(error, 'تعذّر إنشاء الملاحظة');
        throw error;
      }
    },
    [select, store]
  );

  const handleDeleted = useCallback(
    (note: Note) => {
      if (!store) return;
      const deletedName = noteName(note.body) || 'ملاحظة بلا نصّ';
      select(null);
      toast(`حُذفت «${deletedName}»`, {
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
    <div className="mx-auto w-full max-w-3xl space-y-4" data-notes-ready={ready ? 'true' : 'false'}>
      <div className="flex items-center justify-end">
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
        <NotesList
          notes={filtered}
          selectedId={selectedId}
          query={query}
          onSelect={select}
          onQueryChange={setQuery}
        />
      )}

      {ready && store && (
        <FabButton id="btn-new-note" label="ملاحظة جديدة" onClick={() => setComposerOpen(true)}>
          <FilePlus2 className="size-6 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-6" />
        </FabButton>
      )}

      <NoteComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onCreate={handleCreate}
      />

      <NoteEditorDialog
        note={selected}
        store={store}
        onClose={() => select(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
