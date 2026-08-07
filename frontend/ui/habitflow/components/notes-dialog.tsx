'use client';

import { useState, useEffect } from 'react';
import { BookOpenText, Loader2, Calendar, Sparkles } from 'lucide-react';
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

  const maxLength = 500;
  const charCount = note.length;
  const isNearLimit = charCount >= 450;
  const isAtLimit = charCount >= maxLength;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="sm:max-w-lg w-[calc(100%-2rem)] mx-auto p-0 rounded-3xl overflow-hidden border border-border/60 bg-background/95 backdrop-blur-2xl shadow-2xl shadow-black/10 transition-all duration-300"
      >
        {/* Header Section */}
        <div className="relative border-b border-border/40 bg-muted/20 px-6 pt-6 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <BookOpenText className="h-5.5 w-5.5" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogHeader className="p-0 space-y-0 text-right">
                <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  ملاحظة اليوم
                </DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground mt-0.5 font-normal truncate">
                سجِّل انطباعاتك ومُفكِّرة إنجازك لهذا اليوم
              </p>
            </div>
          </div>
        </div>

        {/* Main Content & Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(note);
          }}
          className="p-6 space-y-5 text-right"
        >
          {/* Habit Context Card */}
          <div className="group rounded-2xl border border-border/50 bg-linear-to-br from-muted/40 to-muted/10 p-4 transition-all duration-200 hover:border-border/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="flex h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-foreground truncate break-all sm:break-normal">
                  {habitName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border/40 shadow-2xs backdrop-blur-xs shrink-0">
                <Calendar className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
                <span>{dateLabel}</span>
              </div>
            </div>
          </div>

          {/* Textarea Input Group */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="input-log-note"
                className="font-medium text-foreground/90 flex items-center gap-1.5 select-none"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>لماذا / كيف شعرت؟</span>
              </label>

              {/* Dynamic Character Counter Badge */}
              <div
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium transition-all duration-200 select-none ${
                  isAtLimit
                    ? 'bg-destructive/10 text-destructive border border-destructive/20 font-bold'
                    : isNearLimit
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-semibold'
                      : 'bg-muted text-muted-foreground/80 border border-border/40'
                }`}
                dir="ltr"
              >
                <span>{charCount}</span>
                <span className="opacity-40">/</span>
                <span>{maxLength}</span>
              </div>
            </div>

            <div className="relative group">
              <Textarea
                id="input-log-note"
                value={note}
                onChange={(e) => {
                  if (e.target.value.length <= 500) setNote(e.target.value);
                }}
                placeholder="اكتب عن تجربتك مع هذه العادة اليوم... تسجيل المشاعر يُقوِّي الالتزام."
                rows={5}
                maxLength={500}
                autoFocus
                className="w-full rounded-2xl border-border/60 bg-muted/20 p-3.5 text-sm font-medium leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 focus-visible:outline-none transition-all duration-200 resize-none shadow-2xs"
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-border/30 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 sm:flex-none rounded-xl px-5 py-2.5 text-xs font-semibold border-border/60 hover:bg-muted/80 hover:text-foreground active:scale-[0.98] transition-all duration-200 h-10"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              id="btn-save-note"
              className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 text-xs font-semibold shadow-md shadow-primary/15 transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60 disabled:scale-100 disabled:cursor-not-allowed h-10 flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>جاري الحفظ...</span>
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
