'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { cn } from '@/frontend/shared/cn';

/**
 * The reasons the report row offers. They are sentences a member can pick, not
 * a vocabulary: the stored `reason` is the one they chose, followed by their own
 * note when they wrote one.
 */
const REASONS = [
  { id: 'harassment', label: 'مضايقة أو إساءة' },
  { id: 'content', label: 'محتوى غير لائق' },
  { id: 'impersonation', label: 'انتحال شخصية' },
  { id: 'spam', label: 'رسائل مزعجة' },
  { id: 'other', label: 'سبب آخر' },
] as const;

type ReasonId = (typeof REASONS)[number]['id'];

export function ReportChatDialog({
  open,
  isSubmitting,
  onReport,
  onCancel,
}: {
  open: boolean;
  isSubmitting: boolean;
  onReport: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<ReasonId>('harassment');
  const [note, setNote] = useState('');

  const picked = REASONS.find((entry) => entry.id === reason) ?? REASONS[0];
  const payload = [picked.label, note.trim()].filter(Boolean).join(' — ');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        hideClose
        className="sm:max-w-md w-[calc(100%-2rem)] mx-auto p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-border/80 bg-background shadow-2xl"
        onPointerDownOutside={(event) => {
          event.preventDefault();
          onCancel();
        }}
        onEscapeKeyDown={onCancel}
      >
        <DialogHeader className="flex flex-col items-center text-center space-y-0 pt-1 pe-0">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/25 sm:h-14 sm:w-14 dark:bg-primary/20 dark:ring-primary/30">
            <Flag aria-hidden="true" className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
          </div>
          <DialogTitle className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
            إبلاغ عن المحادثة
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            اختر السبب، وأضف ما يوضّحه إن أردت. يصل الإبلاغ إلى فريق الموقع مع مقتطف من المحادثة.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="mt-5 space-y-1.5">
          <legend className="sr-only">سبب الإبلاغ</legend>
          {REASONS.map((entry) => (
            <label
              key={entry.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-safe',
                reason === entry.id
                  ? 'border-primary/40 bg-primary/10 font-bold text-foreground'
                  : 'border-border/60 text-muted-foreground hover:bg-accent'
              )}
            >
              <input
                type="radio"
                name="chat-report-reason"
                value={entry.id}
                checked={reason === entry.id}
                onChange={() => setReason(entry.id)}
                className="size-4 accent-primary"
              />
              {entry.label}
            </label>
          ))}
        </fieldset>

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="ملاحظة إضافية (اختياري)"
          aria-label="ملاحظة إضافية"
          className="mt-3 max-h-32 w-full resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
        />

        <DialogActions onCancel={onCancel} cancelLabel="إلغاء" className="mt-6 sm:mt-8 pt-0">
          <HeroCtaButton
            type="button"
            onClick={() => onReport(payload)}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            إرسال الإبلاغ
          </HeroCtaButton>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
