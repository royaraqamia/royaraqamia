'use client';

import React from 'react';
import { AlertCircle, Loader2, Bell, Target } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { HABIT_ICONS } from '@/frontend/shared/habitflow/habit-icons';
import { HabitTargetPeriod } from '@/shared/contracts/habitflow';

interface AddHabitModalProps {
  isOpen: boolean;
  habitName: string;
  habitIcon: string;
  habitFrequency: 'daily' | 'weekly';
  habitTarget: string;
  habitTargetPeriod: HabitTargetPeriod | '';
  habitReminderTime: string;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onIconChange: (icon: string) => void;
  onFrequencyChange: (freq: 'daily' | 'weekly') => void;
  onTargetChange: (value: string) => void;
  onTargetPeriodChange: (period: HabitTargetPeriod | '') => void;
  onReminderTimeChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  formError?: string;
  isSubmitting?: boolean;
}

export function AddHabitModal({
  isOpen,
  habitName,
  habitIcon,
  habitFrequency,
  habitTarget,
  habitTargetPeriod,
  habitReminderTime,
  formError,
  isSubmitting,
  onClose,
  onNameChange,
  onIconChange,
  onFrequencyChange,
  onTargetChange,
  onTargetPeriodChange,
  onReminderTimeChange,
  onSubmit,
}: AddHabitModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-120 w-[calc(100%-1.5rem)] mx-auto p-0 rounded-[28px] border border-border/40 bg-background shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] dark:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]">
        <DialogHeader className="sticky top-0 z-10 px-6 sm:px-8 pt-8 pb-4 text-start rounded-t-[28px] bg-background">
          <DialogTitle className="text-xl sm:text-2xl font-semibold text-foreground/90">
            إنشاء عادة روتينيَّة
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="px-6 sm:px-8 pb-8 space-y-7 text-start" dir="rtl">
          {formError && (
            <div
              id="add-habit-error"
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
                htmlFor="input-add-habit-name"
                className="text-[13px] font-medium text-foreground/80"
              >
                اسم العادة
              </label>
              <span
                className={`text-[11px] font-mono font-medium transition-colors duration-300 ${
                  habitName.length >= 45
                    ? 'text-amber-500 font-semibold'
                    : 'text-muted-foreground/50'
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
              placeholder="مثال: أذكار الصَّباح، القراءة..."
              required
              maxLength={50}
              id="input-add-habit-name"
              autoFocus
              aria-describedby={formError ? 'add-habit-error' : undefined}
              className="w-full h-12 px-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all duration-300 text-[15px] font-medium placeholder:text-muted-foreground/40 shadow-sm"
            />
          </section>

          {/* Tracking Frequency Section */}
          <fieldset className="space-y-2.5 border-0 p-0 m-0">
            <legend className="text-[13px] font-medium text-foreground/80 mb-2.5">
              وتيرة التَّتبُّع
            </legend>
            <div className="flex p-1 bg-muted/30 rounded-xl border border-border/40 shadow-inner">
              <button
                type="button"
                onClick={() => onFrequencyChange('daily')}
                aria-pressed={habitFrequency === 'daily'}
                className={`flex-1 flex items-center justify-center py-2 px-4 text-[13px] font-medium rounded-lg transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] ${
                  habitFrequency === 'daily'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50 font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                يوميَّة
              </button>
              <button
                type="button"
                onClick={() => onFrequencyChange('weekly')}
                aria-pressed={habitFrequency === 'weekly'}
                className={`flex-1 flex items-center justify-center py-2 px-4 text-[13px] font-medium rounded-lg transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] ${
                  habitFrequency === 'weekly'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50 font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                أسبوعيَّة
              </button>
            </div>
          </fieldset>

          {/* Habit Icon Section */}
          <fieldset className="space-y-2.5 border-0 p-0 m-0">
            <legend className="text-[13px] font-medium text-foreground/80 mb-2.5">
              أيقونة العادة
            </legend>
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-45 overflow-y-auto overscroll-contain p-2 -mx-2 px-2">
              {HABIT_ICONS.map((item) => {
                const IconComp = item.icon;
                const isSelected = habitIcon === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => onIconChange(item.name)}
                    aria-label={`اختيار أيقونة ${item.name}`}
                    aria-pressed={isSelected}
                    className={`group relative aspect-square rounded-2xl flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-[0_4px_14px_0] shadow-primary/30 scale-[1.05]'
                        : 'bg-muted/20 border border-transparent hover:border-border/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground hover:shadow-sm'
                    }`}
                  >
                    <IconComp
                      className="w-5.5 h-5.5 transition-transform duration-300 ease-out group-hover:scale-110"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Optional Goal Section */}
          <fieldset className="space-y-3 border-0 p-0 m-0">
            <legend className="text-[13px] font-medium text-foreground/80 flex items-center gap-1.5 mb-1.5">
              <Target className="w-4 h-4 text-muted-foreground/70" aria-hidden="true" />
              <span>هدف الإنجاز</span>
              <span className="text-[11px] text-muted-foreground/50 font-normal ms-1">
                (اختياري)
              </span>
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label
                  htmlFor="input-add-habit-target"
                  className="text-[11px] font-medium text-muted-foreground/70"
                >
                  عدد المرات
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={habitTarget}
                  onChange={(e) => onTargetChange(e.target.value)}
                  placeholder="مثال: 5"
                  id="input-add-habit-target"
                  className="w-full h-11 px-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all duration-300 text-[14px] font-medium placeholder:text-muted-foreground/40"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-muted-foreground/70">
                  الفترة الزمنية
                </label>
                <div className="flex p-1 bg-muted/30 rounded-xl border border-border/40 shadow-inner h-11">
                  {(
                    [
                      ['week', 'أسبوعياً'],
                      ['month', 'شهرياً'],
                    ] as const
                  ).map(([value, label]) => {
                    const isSelected = habitTargetPeriod === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onTargetPeriodChange(isSelected ? '' : value)}
                        aria-pressed={isSelected}
                        className={`flex-1 flex items-center justify-center text-[12px] font-medium rounded-lg transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] ${
                          isSelected
                            ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50 font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/50 leading-relaxed text-pretty">
              متابعة التقدّم الإجمالي نحو تحقيق الهدف في الفترة المُحدّدة.
            </p>
          </fieldset>

          {/* Optional Reminder Section */}
          <fieldset className="space-y-2.5 border-0 p-0 m-0">
            <legend className="text-[13px] font-medium text-foreground/80 flex items-center gap-1.5 mb-1.5">
              <Bell className="w-4 h-4 text-muted-foreground/70" aria-hidden="true" />
              <span>وقت التذكير اليومي</span>
              <span className="text-[11px] text-muted-foreground/50 font-normal ms-1">
                (اختياري)
              </span>
            </legend>
            <div className="relative">
              <Input
                type="time"
                value={habitReminderTime}
                onChange={(e) => onReminderTimeChange(e.target.value)}
                id="input-add-habit-reminder-time"
                className="w-full h-12 px-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all duration-300 text-[14px] font-medium placeholder:text-muted-foreground/40 scheme-light dark:scheme-dark"
              />
            </div>
            <p className="text-[11px] text-muted-foreground/50 leading-relaxed text-pretty">
              إن لم تُحدد وقتاً، سيُرسل التذكير افتراضياً في الثامنة صباحاً.
            </p>
          </fieldset>

          {/* Footer Actions */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto rounded-xl px-5 py-5 sm:py-2.5 text-[14px] font-medium border-transparent bg-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all duration-300"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              id="btn-submit-add-habit"
              className="w-full sm:w-auto rounded-xl px-7 py-5 sm:py-2.5 text-[14px] font-semibold bg-primary text-primary-foreground hover:bg-primary/95 shadow-[0_4px_14px_0] shadow-primary/20 dark:shadow-primary/10 transition-all duration-300 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin opacity-80" aria-hidden="true" />
                  <span>جارٍ الحفظ...</span>
                </>
              ) : (
                'حفظ العادة'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
