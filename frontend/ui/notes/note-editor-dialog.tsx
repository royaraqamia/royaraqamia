'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';

import type { Note } from '@/shared/contracts/notes';
import type { NotesLocalStore } from '@/frontend/api/notes/local-store';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { noteName } from '@/frontend/shared/notes/text';
import { Button } from '@/frontend/ui/primitives/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';
import { Label } from '@/frontend/ui/primitives/label';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { NoteBodyEditor } from './note-body-editor';

const AUTOSAVE_DELAY_MS = 500;

interface NoteEditorDialogProps {
  note: Note | null;
  store: NotesLocalStore | null;
  /** Closing returns the page to the list. */
  onClose: () => void;
  /** Called once the note is gone, so the page can close the dialog and offer the undo. */
  onDeleted: (note: Note) => void;
}

/**
 * One note, in the same composer shell a new note is written in — a centered
 * dialog on tablet and desktop, a full-screen surface on a phone. There is no
 * title field: the body is the record and its first line is the name the list
 * shows (ADR-0110). The body is Markdown in the store, converted at the
 * rich-text boundary; every keystroke lands in local state and a short debounce
 * writes it to the Local Store, so there is no Save button to forget.
 */
export function NoteEditorDialog({ note, store, onClose, onDeleted }: NoteEditorDialogProps) {
  if (!note || !store) return null;

  // Keyed by id: switching notes mounts a fresh draft rather than reusing the
  // previous note's state.
  return (
    <NoteEditorDialogBody
      key={note.id}
      note={note}
      store={store}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}

function NoteEditorDialogBody({
  note,
  store,
  onClose,
  onDeleted,
}: {
  note: Note;
  store: NotesLocalStore;
  onClose: () => void;
  onDeleted: (note: Note) => void;
}) {
  const [body, setBody] = useState(note.body);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // The last body that reached the store, so an unchanged note is not written
  // again and a pull that repaints the list does not fight the cursor.
  const savedRef = useRef(note.body);

  // What the component currently holds. Kept in a ref as well as in state so the
  // unmount/pagehide flush can read the newest edit without re-running effects.
  const latestRef = useRef({ id: note.id, body });
  latestRef.current = { id: note.id, body };

  // Autosave: the store write is the durable step, and its Outbox intent is
  // queued in the same transaction, so a closed tab cannot lose the edit. It
  // returns the write so a delete can wait for it: the tombstone must not be
  // overtaken by the unmount flush, which would clear it again.
  const flush = useCallback(async (): Promise<void> => {
    const pending = latestRef.current;
    if (pending.body === savedRef.current) return;

    try {
      const updated = await store.updateNote(pending.id, { body: pending.body });
      if (updated) savedRef.current = pending.body;
    } catch {
      // The edit stays in this component's state; the next keystroke retries.
    }
  }, [store]);

  useEffect(() => {
    if (body === savedRef.current) return undefined;

    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [body, flush]);

  // The debounce is short, but closing the dialog or the tab inside it must not
  // lose the last keystroke: flush on hide and on unmount as well.
  useEffect(() => {
    const onHide = () => void flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void flush();
    };
  }, [flush]);

  const handleConfirmDelete = useCallback(async () => {
    setDeleting(true);
    try {
      // Land the pending edit first: deleting after a late flush would resurrect
      // the note (an edit clears the tombstone).
      await flush();
      const removed = await store.deleteNote(note.id);
      setConfirmOpen(false);
      if (removed) onDeleted(note);
    } finally {
      setDeleting(false);
    }
  }, [flush, note, onDeleted, store]);

  const wordCount = useMemo(() => {
    const text = body.trim();
    return text === '' ? 0 : text.split(/\s+/).length;
  }, [body]);

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="dialog-phone-full max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:flex max-sm:h-dvh max-sm:w-full max-sm:max-w-none max-sm:max-h-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:rounded-none dialog-scrollbar-touch-none sm:max-w-xl sm:max-h-[calc(100dvh_-_2rem)]">
        <DialogHeader>
          <DialogTitle className="text-center">الملاحظة</DialogTitle>
        </DialogHeader>

        {/* The note's own actions, in the header the way a card carries them:
            delete is a menu item, not a bar of red across the composer. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="إجراءات الملاحظة"
              className="absolute top-4 start-4 size-9 rounded-full border border-border bg-muted text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive transition-safe"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="size-4" />
              <span>حذف</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex min-w-0 flex-col gap-1.5 max-sm:min-h-0 max-sm:flex-1">
          <Label htmlFor="note-body">النَّصّ</Label>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-input/80 bg-background/80">
            <NoteBodyEditor
              initialMarkdown={note.body}
              onChange={setBody}
              id="note-body"
              surfaceClassName="min-h-40 max-sm:min-h-0"
            />
          </div>

          <p data-slot="composer-meta" className="text-[11px] text-muted-foreground">
            {wordCount > 0 ? `${wordCount} كلمة · ` : ''}
            آخر تعديل {calculateTimeAgo(note.updatedAt)} · يُحفظ تلقائيًّا
          </p>
        </div>

        <DialogActions onCancel={onClose} cancelLabel="تمّ">
          {null}
        </DialogActions>
      </DialogContent>

      <ConfirmDialog
        open={confirmOpen}
        title="حذف الملاحظة؟"
        message={`سيُحذف «${noteName(note.body) || 'ملاحظة بلا نصّ'}» من هذا الجهاز، ومن أجهزتك الأخرى عند المزامنة. يمكنك التَّراجع عنه بعد الحذف لثوانٍ.`}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        icon={Trash2}
        isConfirming={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </Dialog>
  );
}
