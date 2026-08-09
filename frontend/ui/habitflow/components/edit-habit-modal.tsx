'use client';

import React from 'react';
import { Trash2, AlertCircle, Loader2, Bell, Target } from 'lucide-react';
import { Habit, HabitTargetPeriod } from '@/shared/contracts/habitflow';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { HABIT_ICONS } from '@/frontend/shared/habitflow/habit-icons';

interface EditHabitModalProps {
  isOpen: boolean;
  habit: Habit | null;
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
  onArchive: (id: string) => void;
  formError?: string;
  isSubmitting?: boolean;
}

export function EditHabitModal({
  isOpen,
  habit,
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
  onArchive,
}: EditHabitModalProps) {
  return (
    <Dialog
      open={isOpen && !!habit}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] mx-auto p-0 rounded-3xl overflow-hidden border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl transition-all duration-300">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 text-right">
          <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            تعديل خصائص العادة
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="p-6 space-y-6 text-right" dir="rtl">
          {formError && (
            <div
              id="edit-habit-error"
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs sm:text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{formError}</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-edit-habit-name"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90"
              >
                اسم العادة
              </label>
              <span
                className={`text-xs font-mono font-medium transition-colors ${
                  habitName.length >= 45 ? 'text-amber-500 font-bold' : 'text-muted-foreground/70'
                }`}
                dir="ltr"
              >
                {habitName.length} / 50
              </span>
            </div>
            <div className="relative">
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
                className="w-full h-11 px-4 rounded-xl border-border/60 bg-muted/30 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <fieldset className="space-y-2 border-0 p-0 m-0">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90 mb-2">
              وتيرة التَّتبُّع
            </legend>
            <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-muted/40 rounded-2xl border border-border/40 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => onFrequencyChange('daily')}
                className={`flex items-center justify-center py-2.5 px-4 text-xs font-semibold rounded-xl transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.98] ${
                  habitFrequency === 'daily'
                    ? 'bg-background text-foreground shadow-sm border border-border/50 font-bold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40 border border-transparent'
                }`}
              >
                يوميَّة
              </button>
              <button
                type="button"
                onClick={() => onFrequencyChange('weekly')}
                className={`flex items-center justify-center py-2.5 px-4 text-xs font-semibold rounded-xl transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.98] ${
                  habitFrequency === 'weekly'
                    ? 'bg-background text-foreground shadow-sm border border-border/50 font-bold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40 border border-transparent'
                }`}
              >
                أسبوعيَّة
              </button>
            </div>
          </fieldset>

          <fieldset className="space-y-2 border-0 p-0 m-0">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90 mb-2">
              أيقونة العادة
            </legend>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 max-h-52 overflow-y-auto p-2 rounded-2xl bg-muted/20 border border-border/30">
              {HABIT_ICONS.map((item) => {
                const IconComp = item.icon;
                const isSelected = habitIcon === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => onIconChange(item.name)}
                    aria-label={item.name}
                    aria-pressed={isSelected}
                    className={`group relative aspect-square rounded-xl flex items-center justify-center transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]'
                        : 'bg-background/80 hover:bg-background border border-border/50 text-muted-foreground hover:text-foreground hover:border-border hover:scale-105 shadow-xs'
                    }`}
                  >
                    <IconComp
                      className="w-5 h-5 transition-transform duration-200 group-hover:scale-110"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2 border-0 p-0 m-0">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90 mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" aria-hidden="true" />
              هدف أسبوعي/شهري (اختياري)
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="input-edit-habit-target"
                  className="text-[11px] font-medium text-muted-foreground/80"
                >
                  عدد مرات الإنجاز
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={habitTarget}
                  onChange={(e) => onTargetChange(e.target.value)}
                  placeholder="مثال: 5"
                  id="input-edit-habit-target"
                  className="w-full h-10 px-4 rounded-xl border-border/60 bg-muted/30 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="input-edit-habit-target-period"
                  className="text-xs font-medium text-muted-foreground/80"
                >
                  الفترة
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-muted/40 rounded-2xl border border-border/40 backdrop-blur-sm">
                  {(
                    [
                      ['week', 'أسبوعي'],
                      ['month', 'شهري'],
                    ] as const
                  ).map(([value, label]) => {
                    const isSelected = habitTargetPeriod === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onTargetPeriodChange(isSelected ? '' : value)}
                        className={`flex items-center justify-center py-2 px-3 text-xs font-semibold rounded-xl transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.98] ${
                          isSelected
                            ? 'bg-background text-foreground shadow-sm border border-border/50 font-bold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background/40 border border-transparent'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              حدّد عدد مرات إنجاز العادة المطلوبة أسبوعياً أو شهرياً لمتابعة تقدّمك نحو الهدف
            </p>
          </fieldset>

          <fieldset className="space-y-2 border-0 p-0 m-0">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90 mb-2 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              وقت التذكير اليومي (اختياري)
            </legend>
            <div className="relative">
              <Input
                type="time"
                value={habitReminderTime}
                onChange={(e) => onReminderTimeChange(e.target.value)}
                id="input-edit-habit-reminder-time"
                className="w-full h-11 px-4 rounded-xl border-border/60 bg-muted/30 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium placeholder:text-muted-foreground/50 [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              إن لم تُحدد وقتاً، سيُرسل التذكير افتراضياً في الثامنة صباحاً
            </p>
          </fieldset>

          <div className="pt-4 border-t border-border/40 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <Button
              type="button"
              onClick={() => habit && onArchive(habit.id)}
              disabled={!habit}
              variant="ghost"
              className="group hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all duration-200 rounded-xl px-3.5 py-2.5 text-xs font-medium flex items-center justify-center gap-2 h-auto"
              id="btn-archive-habit"
            >
              <Trash2 className="w-4 h-4 transition-transform group-hover:scale-110 text-muted-foreground group-hover:text-destructive" />
              <span>أرشفة العادة</span>
            </Button>

            <div className="flex items-center gap-2.5">
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
                disabled={isSubmitting}
                id="btn-submit-edit-habit"
                className="flex-1 sm:flex-none rounded-xl px-5 py-2.5 text-xs font-semibold shadow-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-70 h-auto flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>جارٍ التَّطبيق...</span>
                  </>
                ) : (
                  'تطبيق التَّغييرات'
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
