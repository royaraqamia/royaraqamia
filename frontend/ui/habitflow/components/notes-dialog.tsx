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
        className="sm:max-w-xl w-[calc(100%-1.5rem)] mx-auto p-0 rounded-4xl border border-border/40 bg-background/85 backdrop-blur-3xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.15)] transform-gpu transition-all duration-300 ease-out"
      >
        {/* Header Section */}
        <div className="relative rounded-t-4xl border-b border-border/30 bg-linear-to-b from-muted/40 to-transparent px-6 sm:px-8 pt-8 pb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-inset ring-primary/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
              <BookOpenText className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <DialogHeader className="p-0 space-y-0 text-right">
                <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  ملاحظة اليوم
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground/80 mt-1.5 font-medium leading-relaxed sm:truncate">
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
          className="text-right flex flex-col"
        >
          <div className="p-6 sm:p-8 space-y-6">
            {/* Habit Context Card */}
            <div className="group rounded-2xl border border-border/40 bg-muted/20 p-4 sm:p-5 transition-all duration-300 hover:bg-muted/40 hover:border-border/60 hover:shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <span className="text-sm font-semibold text-foreground/90 truncate wrap-break-word line-clamp-2 sm:line-clamp-1">
                    {habitName}
                  </span>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto rounded-xl bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground border border-border/50 shadow-sm shrink-0 transition-colors group-hover:text-foreground/80 group-hover:border-border/80">
                  <Calendar className="h-4 w-4 text-primary/80" aria-hidden="true" />
                  <span>{dateLabel}</span>
                </div>
              </div>
            </div>

            {/* Textarea Input Group */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                <label
                  htmlFor="input-log-note"
                  className="font-semibold text-foreground/90 flex items-center gap-2 select-none"
                >
                  <Sparkles className="h-4 w-4 text-primary/90" aria-hidden="true" />
                  <span>كيف كانت تجربتك اليوم؟</span>
                </label>

                {/* Dynamic Character Counter Badge */}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium transition-all duration-300 select-none shadow-sm ${
                    isAtLimit
                      ? 'bg-destructive/15 text-destructive border-destructive/30 font-bold scale-[1.02]'
                      : isNearLimit
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-bold scale-[1.02]'
                        : 'bg-background text-muted-foreground border-border/50'
                  } border`}
                  dir="ltr"
                >
                  <span className="min-w-6 text-right">{charCount}</span>
                  <span className="opacity-40">/</span>
                  <span>{maxLength}</span>
                </div>
              </div>

              <div className="relative group">
                <Textarea
                  id="input-log-note"
                  value={note}
                  onChange={(e) => {
                    if (e.target.value.length <= maxLength) setNote(e.target.value);
                  }}
                  placeholder="اكتب عن شعورك تجاه هذه العادة اليوم... تسجيل المشاعر يُقوِّي الالتزام بمرور الوقت."
                  rows={5}
                  maxLength={maxLength}
                  autoFocus
                  className="w-full min-h-35 rounded-2xl border-border/50 bg-background/50 p-4 sm:p-5 text-sm sm:text-base font-medium leading-relaxed text-foreground placeholder:text-muted-foreground/50 transition-all duration-300 ease-out resize-none shadow-sm hover:border-border/80 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/15 focus:shadow-md focus-visible:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="bg-muted/10 px-6 sm:px-8 py-5 border-t border-border/30 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 rounded-b-4xl">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto rounded-xl px-6 py-2.5 text-sm font-semibold border-border/50 bg-transparent hover:bg-muted/80 hover:text-foreground active:scale-[0.98] transition-all duration-200 h-11"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              id="btn-save-note"
              className="w-full sm:w-auto rounded-xl px-8 py-2.5 text-sm font-semibold shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-primary/30 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:hover:translate-y-0 disabled:scale-100 disabled:cursor-not-allowed h-11 flex items-center justify-center gap-2.5 bg-primary text-primary-foreground hover:bg-primary/95"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" aria-hidden="true" />
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
