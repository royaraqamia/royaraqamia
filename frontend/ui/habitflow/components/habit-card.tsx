import { createElement } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Flame, Edit3, Snowflake, NotebookPen } from 'lucide-react';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { calculateHabitStats } from '@/frontend/shared/habitflow/habit-stats';
import { getIconComponent, getIconColorClass } from '@/frontend/shared/habitflow/habit-icons';
import { Card } from '@/frontend/ui/primitives/card';
import { Button } from '@/frontend/ui/primitives/button';

interface HabitCardProps {
  habit: Habit;
  logs: HabitLog[];
  activeDate: string;
  onToggle: (habitId: string) => void;
  onSkip: (habitId: string) => void;
  onNote: (habitId: string) => void;
  onEdit: (habit: Habit) => void;
  togglingHabitId?: string | null;
  skippingHabitId?: string | null;
}

export function HabitCard({
  habit,
  logs,
  activeDate,
  onToggle,
  onSkip,
  onNote,
  onEdit,
  togglingHabitId,
  skippingHabitId,
}: HabitCardProps) {
  const reduce = useReducedMotion();
  const isCompleted = logs.some(
    (l) => l.habitId === habit.id && l.date === activeDate && l.completed
  );
  const isSkipped = logs.some(
    (l) => l.habitId === habit.id && l.date === activeDate && l.kind === 'skip'
  );
  const hasNote = logs.some((l) => l.habitId === habit.id && l.date === activeDate && !!l.note);
  const isToggling = togglingHabitId === habit.id;
  const isSkipping = skippingHabitId === habit.id;
  const stats = calculateHabitStats(habit.id, logs, activeDate);
  const colorClass = getIconColorClass(habit.icon);

  return (
    <Card
      className={`group relative flex flex-row items-center justify-between p-3.5 sm:p-4 gap-3 sm:gap-4 rounded-2xl border transition-all duration-300 ease-out card-lift ${
        isCompleted
          ? 'border-primary/25 bg-primary/5 shadow-xs'
          : isSkipped
            ? 'border-sky-300/40 bg-sky-500/5 shadow-xs'
            : 'border-border/60 bg-card hover:border-border/90 hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
        {/* Toggle Checkbox Button */}
        <motion.button
          onClick={() => onToggle(habit.id)}
          disabled={isToggling}
          whileTap={reduce || isToggling ? undefined : { scale: 0.92 }}
          transition={reduce ? undefined : { type: 'spring', stiffness: 400, damping: 10 }}
          className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ease-out focus-ring touch-target btn-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
            isCompleted
              ? 'bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20 ring-2 ring-primary/20'
              : 'border-border/80 bg-background hover:border-primary/60 hover:bg-primary/5'
          } ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
          aria-label={`${isCompleted ? 'إلغاء تسجيل' : 'تسجيل'} عادة ${habit.name}`}
          aria-pressed={isCompleted}
          id={`check-habit-${habit.id}`}
        >
          {isCompleted && (
            <motion.span
              initial={reduce ? false : { scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={reduce ? undefined : { type: 'spring', stiffness: 500, damping: 15 }}
              className="flex items-center justify-center"
            >
              <Check className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.5]" />
            </motion.span>
          )}
        </motion.button>

        {/* Habit Icon & Details */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <div
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105 shadow-2xs ${colorClass}`}
          >
            {createElement(getIconComponent(habit.icon), {
              className: 'w-4.5 h-4.5 sm:w-5 sm:h-5',
            })}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h4
              className={`text-sm sm:text-base font-bold leading-snug tracking-tight truncate transition-colors duration-200 ${
                isCompleted
                  ? 'line-through text-muted-foreground/70'
                  : isSkipped
                    ? 'text-foreground/80'
                    : 'text-foreground'
              }`}
              title={habit.name}
            >
              {habit.name}
            </h4>

            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {isSkipped ? (
                <span className="text-[10px] sm:text-xs font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-300/40 flex items-center gap-1 px-2 py-0.5 rounded-md whitespace-nowrap shrink-0">
                  <Snowflake className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>مُتخطّى</span>
                </span>
              ) : (
                <span className="text-[10px] sm:text-xs font-semibold bg-muted/80 text-muted-foreground uppercase tracking-wider px-2 py-0.5 rounded-md border border-border/40 whitespace-nowrap">
                  {habit.frequency === 'daily' ? 'يومي' : 'أسبوعي'}
                </span>
              )}

              <span className="text-[10px] sm:text-xs text-border/80 shrink-0 select-none">•</span>

              {stats.currentStreak > 0 ? (
                <span className="text-[10px] sm:text-xs font-bold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 px-2 py-0.5 rounded-md whitespace-nowrap shrink-0 shadow-2xs">
                  <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-primary/20 text-primary" />
                  <span>{stats.currentStreak}</span>
                </span>
              ) : (
                <span className="text-[10px] sm:text-xs text-muted-foreground/80 font-medium truncate">
                  لا يوجد تسلسل
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Skip (streak-freeze) & Edit Action Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onSkip(habit.id)}
          disabled={isSkipping || isCompleted}
          aria-label={`${isSkipped ? 'إلغاء تخطي' : 'تخطي'} عادة ${habit.name} لهذا اليوم`}
          aria-pressed={isSkipped}
          id={`skip-habit-${habit.id}`}
          className={`shrink-0 rounded-xl transition-all duration-200 touch-target focus-ring btn-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer ${
            isSkipped
              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-300/50'
              : 'text-muted-foreground/70 hover:text-sky-500 hover:bg-sky-500/10 opacity-70 group-hover:opacity-100'
          } ${isSkipping ? 'opacity-50 cursor-wait' : ''}`}
          title="تخطي هذا اليوم دون كسر السلسلة"
        >
          <Snowflake className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onNote(habit.id)}
          aria-label={`ملاحظة عادة ${habit.name} لهذا اليوم`}
          aria-pressed={hasNote}
          id={`note-habit-${habit.id}`}
          className={`shrink-0 rounded-xl transition-all duration-200 touch-target focus-ring btn-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer ${
            hasNote
              ? 'bg-primary/10 text-primary border border-primary/25'
              : 'text-muted-foreground/70 hover:text-primary hover:bg-primary/10 opacity-70 group-hover:opacity-100'
          }`}
          title={hasNote ? 'تعديل ملاحظة اليوم' : 'إضافة ملاحظة'}
        >
          <NotebookPen className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(habit)}
          aria-label={`تعديل عادة ${habit.name}`}
          id={`edit-habit-${habit.id}`}
          className="shrink-0 rounded-xl hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all duration-200 touch-target focus-ring btn-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 opacity-80 group-hover:opacity-100 cursor-pointer"
        >
          <Edit3 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
        </Button>
      </div>
    </Card>
  );
}
