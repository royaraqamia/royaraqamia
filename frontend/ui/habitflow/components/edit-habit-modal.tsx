'use client';

import React, { memo } from 'react';
import { Trash2, AlertCircle, Loader2, Bell } from 'lucide-react';
import { Habit, HabitTargetPeriod } from '@/shared/contracts/habitflow';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { Button } from '@/frontend/ui/primitives/button';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { Input } from '@/frontend/ui/primitives/input';
import { TimePicker } from '@/frontend/ui/primitives/time-picker';

interface EditHabitModalProps {
  isOpen: boolean;
  habit: Habit | null;
  habitName: string;
  habitFrequency: 'daily' | 'weekly';
  habitTarget: string;
  habitTargetPeriod: HabitTargetPeriod | '';
  habitReminderTime: string;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onFrequencyChange: (freq: 'daily' | 'weekly') => void;
  onTargetChange: (value: string) => void;
  onTargetPeriodChange: (period: HabitTargetPeriod | '') => void;
  onReminderTimeChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onArchive: (id: string) => void;
  formError?: string;
  isSubmitting?: boolean;
}

export const EditHabitModal = memo(function EditHabitModal({
  isOpen,
  habit,
  habitName,
  habitFrequency,
  habitReminderTime,
  formError,
  isSubmitting,
  onClose,
  onNameChange,
  onFrequencyChange,
  onReminderTimeChange,
  onSubmit,
  onArchive,
}: EditHabitModalProps) {
  return (
    <Dialog
      open={isOpen && !!habit}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        hideClose
        className="sm:max-w-120 w-[calc(100%-1.5rem)] mx-auto p-0 gap-0 rounded-[28px] border border-border/40 bg-background shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] dark:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]"
      >
        <DialogTitle className="sr-only">تعديل خصائص العادة</DialogTitle>

        <form onSubmit={onSubmit} className="px-6 sm:px-8 pt-8 pb-8 space-y-6 text-start" dir="rtl">
          {formError && (
            <div
              id="edit-habit-error"
              className="flex items-start gap-3 p-4 rounded-2xl bg-destructive/5 border border-destructive/10 text-destructive text-[13px] sm:text-sm font-medium animate-in fade-in zoom-in-95 duration-300"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 opacity-80" aria-hidden="true" />
              <span className="flex-1 leading-relaxed text-balance">{formError}</span>
            </div>
          )}

          {/* Habit Name Section */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-edit-habit-name"
                className="text-[13px] font-medium text-foreground/80"
              >
                اسم العادة
              </label>
              <span
                className={`text-[11px] font-mono font-medium transition-colors duration-300 ${
                  habitName.length >= 45 ? 'text-amber-500 font-bold' : 'text-muted-foreground/50'
                }`}
                dir="ltr"
                aria-live="polite"
              >
                {habitName.length} / 50
              </span>
            </div>
            <Input
              type="text"
              value={habitName}
              onChange={(e) => {
                if (e.target.value.length <= 50) onNameChange(e.target.value);
              }}
              required
              maxLength={50}
              id="input-edit-habit-name"
              autoFocus
              aria-describedby={formError ? 'edit-habit-error' : undefined}
              className="w-full h-12 px-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/15 transition-safe duration-300 text-[15px] font-medium placeholder:text-muted-foreground/40 shadow-sm"
            />
          </section>

          {/* Tracking Frequency Section */}
          <fieldset className="space-y-2.5 border-0 p-0 m-0">
            <legend className="text-[13px] font-medium text-foreground/80">وتيرة التَّتبُّع</legend>
            <div className="flex p-1 bg-muted/30 rounded-xl border border-border/40 shadow-inner">
              <button
                type="button"
                onClick={() => onFrequencyChange('daily')}
                aria-pressed={habitFrequency === 'daily'}
                className={`flex-1 flex items-center justify-center py-2 px-4 text-[13px] font-medium rounded-lg transition-safe duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] ${
                  habitFrequency === 'daily'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50 font-bold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                يوميَّة
              </button>
              <button
                type="button"
                onClick={() => onFrequencyChange('weekly')}
                aria-pressed={habitFrequency === 'weekly'}
                className={`flex-1 flex items-center justify-center py-2 px-4 text-[13px] font-medium rounded-lg transition-safe duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] ${
                  habitFrequency === 'weekly'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50 font-bold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                أسبوعيَّة
              </button>
            </div>
          </fieldset>

          {/* Optional Reminder Section */}
          <fieldset className="space-y-2.5 border-0 p-0 m-0">
            <legend className="text-[13px] font-medium text-foreground/80 flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-muted-foreground/70" aria-hidden="true" />
              <span>وقت التذكير اليومي</span>
              <span className="text-[11px] text-muted-foreground/50 font-normal ms-1">
                (اختياري)
              </span>
            </legend>
            <div className="relative">
              <TimePicker
                value={habitReminderTime}
                onChange={onReminderTimeChange}
                aria-label="وقت التذكير اليومي"
                className="w-full"
                triggerClassName="flex-1 h-12"
              />
            </div>
          </fieldset>

          {/* Footer Actions */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <Button
              type="button"
              onClick={() => habit && onArchive(habit.id)}
              disabled={!habit}
              variant="ghost"
              className="w-full sm:w-auto group hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-safe duration-300 rounded-xl px-5 h-13 sm:h-14 text-[14px] font-medium flex items-center justify-center gap-2"
              id="btn-archive-habit"
            >
              <Trash2 className="w-4 h-4 transition-transform group-hover:scale-110 text-muted-foreground group-hover:text-destructive" />
              <span>أرشفة العادة</span>
            </Button>

            <div className="flex flex-col-reverse sm:flex-row items-center gap-3 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="w-full sm:w-auto rounded-xl px-5 h-13 sm:h-14 text-[14px] font-medium border-transparent bg-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-safe duration-300"
              >
                إلغاء
              </Button>
              <HeroCtaButton
                type="submit"
                disabled={isSubmitting}
                id="btn-submit-edit-habit"
                className="w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin opacity-80" aria-hidden="true" />
                    <span>جاري التَّطبيق...</span>
                  </>
                ) : (
                  'تطبيق التَّغييرات'
                )}
              </HeroCtaButton>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
});
