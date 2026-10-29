'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { NOTE_TITLE_MAX, type Note } from '@/shared/contracts/notes';
import type { NotesLocalStore } from '@/frontend/api/notes/local-store';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { Button } from '@/frontend/ui/primitives/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { Input } from '@/frontend/ui/primitives/input';
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
 * dialog on tablet and desktop, a full-screen surface on a phone. The body is
 * Markdown in the store, converted at the rich-text boundary; every keystroke
 * lands in local state and a short debounce writes it to the Local Store, so
 * there is no Save button to forget.
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
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // The last values that reached the store, so an unchanged note is not written
  // again and a pull that repaints the list does not fight the cursor.
  const savedRef = useRef({ title: note.title, body: note.body });

  // What the component currently holds. Kept in a ref as well as in state so the
  // unmount/pagehide flush can read the newest edit without re-running effects.
  const latestRef = useRef({ id: note.id, title, body });
  latestRef.current = { id: note.id, title, body };

  // Autosave: the store write is the durable step, and its Outbox intent is
  // queued in the same transaction, so a closed tab cannot lose the edit. It
  // returns the write so a delete can wait for it: the tombstone must not be
  // overtaken by the unmount flush, which would clear it again.
  const flush = useCallback(async (): Promise<void> => {
    const pending = latestRef.current;
    const saved = savedRef.current;
    if (pending.title === saved.title && pending.body === saved.body) return;

    try {
      const updated = await store.updateNote(pending.id, {
        title: pending.title,
        body: pending.body,
      });
      if (updated) savedRef.current = { title: pending.title, body: pending.body };
    } catch {
      // The edit stays in this component's state; the next keystroke retries.
    }
  }, [store]);

  useEffect(() => {
    const saved = savedRef.current;
    if (title === saved.title && body === saved.body) return undefined;

    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [title, body, flush]);

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
      <DialogContent className="max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:flex max-sm:h-dvh max-sm:w-full max-sm:max-w-none max-sm:max-h-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:rounded-none sm:max-w-xl sm:max-h-[calc(100dvh_-_2rem)]">
        <DialogHeader>
          <DialogTitle className="text-center">الملاحظة</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col">
          <div className="space-y-1.5">
            <Label htmlFor="note-title">العنوان</Label>
            <Input
              id="note-title"
              value={title}
              maxLength={NOTE_TITLE_MAX}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="بدون عنوان"
            />
          </div>

          <div className="space-y-1.5 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col">
            <Label htmlFor="note-body">النَّصّ</Label>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-input/80 bg-background/80">
              <NoteBodyEditor
                initialMarkdown={note.body}
                onChange={setBody}
                id="note-body"
                surfaceClassName="min-h-40 max-sm:min-h-0"
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {wordCount > 0 ? `${wordCount} كلمة · ` : ''}
            آخر تعديل {calculateTimeAgo(note.updatedAt)} · يُحفظ تلقائيًّا على هذا الجهاز
          </p>
        </div>

        <DialogActions
          onCancel={onClose}
          cancelLabel="تمّ"
          leading={
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(true)}
              aria-label="حذف الملاحظة"
              className="w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
            >
              <Trash2 aria-hidden="true" />
              حذف
            </Button>
          }
        >
          {null}
        </DialogActions>
      </DialogContent>

      <ConfirmDialog
        open={confirmOpen}
        title="حذف الملاحظة؟"
        message={`سيُحذف «${note.title.trim() || 'بدون عنوان'}» من هذا الجهاز، ومن أجهزتك الأخرى عند المزامنة. يمكنك التَّراجع عنه بعد الحذف لثوانٍ.`}
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
