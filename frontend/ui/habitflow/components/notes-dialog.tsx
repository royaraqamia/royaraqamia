'use client';

import { useState, useEffect } from 'react';
import { BookOpenText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { Button } from '@/frontend/ui/primitives/button';
import { Textarea } from '@/frontend/ui/primitives/textarea';

interface NotesDialogProps {
  isOpen: boolean;
  habitName: string;
  dateLabel: string;
  initialNote: string;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (note: string) => void;
}

export function NotesDialog({
  isOpen,
  habitName,
  dateLabel,
  initialNote,
  isSaving,
  onClose,
  onSave,
}: NotesDialogProps) {
  const [note, setNote] = useState(initialNote);

  useEffect(() => {
    if (isOpen) setNote(initialNote);
  }, [isOpen, initialNote]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] mx-auto p-0 rounded-3xl overflow-hidden border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl transition-all duration-300">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 text-right">
          <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpenText className="w-5 h-5 text-primary" aria-hidden="true" />
            ملاحظة اليوم
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(note);
          }}
          className="p-6 space-y-5 text-right"
          dir="rtl"
        >
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">{habitName}</p>
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-log-note"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90"
              >
                لماذا / كيف شعرت؟
              </label>
              <span
                className={`text-xs font-mono font-medium transition-colors ${
                  note.length >= 480 ? 'text-amber-500 font-bold' : 'text-muted-foreground/70'
                }`}
                dir="ltr"
              >
                {note.length} / 500
              </span>
            </div>
            <Textarea
              id="input-log-note"
              value={note}
              onChange={(e) => {
                if (e.target.value.length <= 500) setNote(e.target.value);
              }}
              placeholder="اكتب عن تجربتك مع هذه العادة اليوم... تسجيل المشاعر يقوّي الالتزام."
              rows={5}
              maxLength={500}
              autoFocus
              className="w-full rounded-xl border-border/60 bg-muted/30 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium placeholder:text-muted-foreground/50 resize-none"
            />
          </div>

          <div className="pt-3 border-t border-border/40 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 sm:flex-none rounded-xl px-4 py-2.5 text-xs font-medium border-border/60 hover:bg-muted/80 transition-all duration-200 h-auto"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              id="btn-save-note"
              className="flex-1 sm:flex-none rounded-xl px-5 py-2.5 text-xs font-semibold shadow-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-70 h-auto flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>جارٍ الحفظ...</span>
                </>
              ) : (
                'حفظ الملاحظة'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
