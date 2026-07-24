'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HABIT_ICONS } from '@/domains/habitflow/frontend/shared/habit-icons';

interface AddHabitModalProps {
  isOpen: boolean;
  habitName: string;
  habitIcon: string;
  habitFrequency: 'daily' | 'weekly';
  onClose: () => void;
  onNameChange: (name: string) => void;
  onIconChange: (icon: string) => void;
  onFrequencyChange: (freq: 'daily' | 'weekly') => void;
  onSubmit: (e: React.FormEvent) => void;
  formError?: string;
  isSubmitting?: boolean;
}

export function AddHabitModal({
  isOpen,
  habitName,
  habitIcon,
  habitFrequency,
  formError,
  isSubmitting,
  onClose,
  onNameChange,
  onIconChange,
  onFrequencyChange,
  onSubmit,
}: AddHabitModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنشاء عادة روتينية</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-5">
          {formError && (
            <div
              id="add-habit-error"
              className="bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold rounded-lg px-4 py-3 text-center"
              role="alert"
            >
              {formError}
            </div>
          )}
          <div className="space-y-2">
            <label
              htmlFor="input-add-habit-name"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              اسم العادة
            </label>
            <div className="relative">
              <Input
                type="text"
                value={habitName}
                onChange={(e) => {
                  if (e.target.value.length <= 50) onNameChange(e.target.value);
                }}
                placeholder="مثال: تأمل الصباح"
                required
                maxLength={50}
                id="input-add-habit-name"
                autoFocus
                aria-describedby={formError ? 'add-habit-error' : undefined}
                className="touch-target"
              />
            </div>
            <p className="text-xs text-muted-foreground text-left" dir="ltr">
              {habitName.length}/50
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              وتيرة التتبع
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onFrequencyChange('daily')}
                className={`py-3 px-4 text-xs font-semibold rounded-xl border transition-all duration-200 ease-out btn-press touch-target focus-ring ${
                  habitFrequency === 'daily'
                    ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-muted text-foreground hover:bg-accent'
                }`}
              >
                يومية
              </button>
              <button
                type="button"
                onClick={() => onFrequencyChange('weekly')}
                className={`py-3 px-4 text-xs font-semibold rounded-xl border transition-all duration-200 ease-out btn-press touch-target focus-ring ${
                  habitFrequency === 'weekly'
                    ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-muted text-foreground hover:bg-accent'
                }`}
              >
                أسبوعية
              </button>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              أيقونة العادة
            </legend>
            <div className="grid grid-cols-4 gap-3 p-1">
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
                    className={`aspect-square rounded-xl flex items-center justify-center border transition-all duration-200 ease-out btn-press touch-target focus-ring ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:border-border'
                    }`}
                  >
                    <IconComp className="w-5 h-5" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="touch-target btn-press focus-ring"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              id="btn-submit-add-habit"
              className="touch-target btn-press focus-ring"
            >
              {isSubmitting ? 'جارٍ الحفظ...' : 'حفظ العادة'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
