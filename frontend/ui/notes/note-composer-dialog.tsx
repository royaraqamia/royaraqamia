'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { Label } from '@/frontend/ui/primitives/label';
import { NoteBodyEditor } from './note-body-editor';

interface NoteComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creates the note from what the composer collected. */
  onCreate: (input: { body: string }) => Promise<unknown>;
}

/**
 * The notes FAB's surface: the same Facebook-style composer the community FAB
 * opens, with the rich-text body as the only field. A note has no title — its
 * body is the whole record and its first line is what the list calls it
 * (ADR-0110), so there is nothing on this surface that is not the text.
 */
export function NoteComposerDialog({ open, onOpenChange, onCreate }: NoteComposerDialogProps) {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBody('');
    setPending(false);
  }, [open]);

  const handleSubmit = () => {
    if (body.trim() === '') {
      toast.error('اكتب نصًّا للملاحظة');
      return;
    }

    setPending(true);
    void onCreate({ body })
      .then(() => {
        onOpenChange(false);
      })
      .catch(() => {
        // The caller names the failure; the draft stays here so it is not lost.
      })
      .finally(() => setPending(false));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="dialog-phone-full max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:flex max-sm:h-dvh max-sm:w-full max-sm:max-w-none max-sm:max-h-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:rounded-none dialog-scrollbar-touch-none sm:max-w-xl sm:max-h-[calc(100dvh_-_2rem)]">
        <DialogHeader>
          <DialogTitle className="text-center">ملاحظة جديدة</DialogTitle>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-1.5 max-sm:min-h-0 max-sm:flex-1">
          <Label htmlFor="composer-note-body">النَّصّ</Label>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-input/80 bg-background/80">
            <NoteBodyEditor
              initialMarkdown=""
              onChange={setBody}
              id="composer-note-body"
              placeholder="اكتب ملاحظتك هنا…"
              surfaceClassName="min-h-40 max-sm:min-h-0"
            />
          </div>
        </div>

        <DialogActions onCancel={() => onOpenChange(false)}>
          <HeroCtaButton
            type="button"
            isLoading={pending}
            onClick={handleSubmit}
            className="w-full sm:w-auto"
          >
            إنشاء الملاحظة
          </HeroCtaButton>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
