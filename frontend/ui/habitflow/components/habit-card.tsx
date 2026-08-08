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
      className={`group relative flex flex-row items-center justify-between p-4 sm:p-5 gap-4 sm:gap-6 rounded-3xl border bg-white dark:bg-[#09090b] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
        isCompleted
          ? 'border-emerald-500/25 shadow-[0_8px_30px_-4px_rgba(16,185,129,0.12)] bg-emerald-500/2'
          : isSkipped
            ? 'border-sky-500/25 shadow-[0_8px_30px_-4px_rgba(14,165,233,0.12)] bg-sky-500/2'
            : 'border-neutral-200/80 dark:border-neutral-800/80 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_40px_-4px_rgba(0,0,0,0.08)] hover:border-neutral-300 dark:hover:border-neutral-700 hover:-translate-y-0.5'
      }`}
    >
      {/* Left Container: Status, Icon, and Details */}
      <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
        {/* Toggle Checkbox Button */}
        <motion.button
          onClick={() => onToggle(habit.id)}
          disabled={isToggling}
          whileTap={reduce || isToggling ? undefined : { scale: 0.9 }}
          transition={reduce ? undefined : { type: 'spring', stiffness: 500, damping: 25 }}
          className={`relative flex items-center justify-center shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full border-[1.5px] transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#09090b] ${
            isCompleted
              ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_2px_16px_rgba(16,185,129,0.4)] ring-4 ring-emerald-500/20 focus-visible:ring-emerald-500'
              : 'border-neutral-300 dark:border-neutral-700 bg-transparent hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 focus-visible:ring-neutral-400'
          } ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
          aria-label={`${isCompleted ? 'إلغاء تسجيل' : 'تسجيل'} عادة ${habit.name}`}
          aria-pressed={isCompleted}
          id={`check-habit-${habit.id}`}
        >
          {isCompleted && (
            <motion.span
              initial={reduce ? false : { scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={reduce ? undefined : { type: 'spring', stiffness: 500, damping: 20 }}
              className="flex items-center justify-center"
            >
              <Check className="w-5 h-5 sm:w-6 sm:h-6 stroke-3" />
            </motion.span>
          )}
        </motion.button>

        {/* Habit Icon & Metadata */}
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
          <div
            className={`flex items-center justify-center shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-[18px] transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-110 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] ${colorClass}`}
          >
            {createElement(getIconComponent(habit.icon), {
              className: 'w-5 h-5 sm:w-6 sm:h-6 opacity-90',
            })}
          </div>

          <div className="min-w-0 flex-1 flex flex-col justify-center space-y-1.5">
            <h4
              className={`text-[15px] sm:text-[17px] font-semibold leading-tight tracking-[-0.01em] truncate transition-all duration-300 ${
                isCompleted
                  ? 'line-through decoration-neutral-300 dark:decoration-neutral-600 text-neutral-400 dark:text-neutral-500'
                  : isSkipped
                    ? 'text-neutral-500 dark:text-neutral-400'
                    : 'text-neutral-900 dark:text-neutral-100'
              }`}
              title={habit.name}
            >
              {habit.name}
            </h4>

            {/* Tags & Metadata */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {isSkipped ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 whitespace-nowrap shrink-0 transition-colors">
                  <Snowflake className="w-3.5 h-3.5" />
                  <span>مُتخطّى</span>
                </span>
              ) : (
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-700/80 whitespace-nowrap transition-colors">
                  {habit.frequency === 'daily' ? 'يومي' : 'أسبوعي'}
                </span>
              )}

              <span className="text-[11px] text-neutral-300 dark:text-neutral-700 shrink-0 select-none">
                •
              </span>

              {stats.currentStreak > 0 ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 whitespace-nowrap shrink-0 shadow-[0_1px_2px_rgba(249,115,22,0.1)] transition-colors">
                  <Flame className="w-3.5 h-3.5 fill-orange-500/20" />
                  <span>{stats.currentStreak}</span>
                </span>
              ) : (
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-medium truncate">
                  لا يوجد تسلسل
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Container: Action Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onSkip(habit.id)}
          disabled={isSkipping || isCompleted}
          aria-label={`${isSkipped ? 'إلغاء تخطي' : 'تخطي'} عادة ${habit.name} لهذا اليوم`}
          aria-pressed={isSkipped}
          id={`skip-habit-${habit.id}`}
          className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-[14px] transition-all duration-300 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#09090b] cursor-pointer ${
            isSkipped
              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 focus-visible:ring-sky-500'
              : 'text-neutral-400 hover:text-sky-500 hover:bg-sky-500/10 hover:border-sky-500/20 border border-transparent focus-visible:ring-sky-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          } ${isSkipping ? 'opacity-50 cursor-wait' : ''}`}
          title="تخطي هذا اليوم دون كسر السلسلة"
        >
          <Snowflake className="w-4.5 h-4.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onNote(habit.id)}
          aria-label={`ملاحظة عادة ${habit.name} لهذا اليوم`}
          aria-pressed={hasNote}
          id={`note-habit-${habit.id}`}
          className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-[14px] transition-all duration-300 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#09090b] cursor-pointer ${
            hasNote
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 focus-visible:ring-indigo-500'
              : 'text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500/20 border border-transparent focus-visible:ring-indigo-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          }`}
          title={hasNote ? 'تعديل ملاحظة اليوم' : 'إضافة ملاحظة'}
        >
          <NotebookPen className="w-4.5 h-4.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(habit)}
          aria-label={`تعديل عادة ${habit.name}`}
          id={`edit-habit-${habit.id}`}
          className="shrink-0 flex items-center justify-center w-10 h-10 rounded-[14px] text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-700 border border-transparent transition-all duration-300 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#09090b] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
        >
          <Edit3 className="w-4.5 h-4.5" />
        </Button>
      </div>
    </Card>
  );
}
