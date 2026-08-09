import { createElement } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Flame, Edit3, Snowflake, NotebookPen, Target, MoreHorizontal } from 'lucide-react';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import {
  calculateHabitStats,
  calculateTargetProgress,
} from '@/frontend/shared/habitflow/habit-stats';
import { getIconComponent, getIconColorClass } from '@/frontend/shared/habitflow/habit-icons';
import { Card } from '@/frontend/ui/primitives/card';
import { Button } from '@/frontend/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';

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
  const targetProgress = calculateTargetProgress(habit, logs, activeDate);
  const colorClass = getIconColorClass(habit.icon);

  return (
    <Card
      className={`group relative flex w-full flex-row items-center justify-between p-3.5 sm:p-5 gap-3 sm:gap-5 rounded-3xl border backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isCompleted
          ? 'border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-[0_8px_24px_-6px_rgba(16,185,129,0.12)]'
          : isSkipped
            ? 'border-sky-500/20 bg-sky-50/50 dark:bg-sky-950/20 shadow-[0_8px_24px_-6px_rgba(14,165,233,0.12)]'
            : 'border-zinc-200/80 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-950/90 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_32px_-6px_rgba(0,0,0,0.08)] hover:border-zinc-300 dark:hover:border-zinc-700 hover:-translate-y-0.5'
      }`}
    >
      {/* Main Content Area */}
      <article className="flex items-center gap-3.5 sm:gap-5 min-w-0 flex-1">
        {/* Toggle Button */}
        <motion.button
          onClick={() => onToggle(habit.id)}
          disabled={isToggling}
          whileTap={reduce || isToggling ? undefined : { scale: 0.92 }}
          transition={reduce ? undefined : { type: 'spring', stiffness: 500, damping: 25 }}
          className={`relative flex items-center justify-center shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full border-[1.5px] outline-none transition-all duration-300 ease-out focus-visible:ring-4 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 ${
            isCompleted
              ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_2px_16px_rgba(16,185,129,0.35)] ring-emerald-500/20 focus-visible:ring-emerald-500'
              : 'border-zinc-300 dark:border-zinc-700 bg-transparent hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 focus-visible:ring-zinc-400'
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
              <Check className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </motion.span>
          )}
        </motion.button>

        {/* Icon & Details Container */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          {/* Visual Icon Box */}
          <div
            className={`flex items-center justify-center shrink-0 w-10 h-10 sm:w-11.5 sm:h-11.5 rounded-[14px] sm:rounded-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 shadow-sm ${colorClass}`}
            aria-hidden="true"
          >
            {createElement(getIconComponent(habit.icon), {
              className: 'w-5 h-5 sm:w-[22px] sm:h-[22px] opacity-90',
            })}
          </div>

          {/* Text & Metadata Grid */}
          <div className="min-w-0 flex-1 flex flex-col justify-center space-y-1 sm:space-y-1.5">
            <h4
              className={`text-[15px] sm:text-[17px] font-semibold leading-tight tracking-tight truncate transition-all duration-300 ${
                isCompleted
                  ? 'line-through decoration-zinc-400 dark:decoration-zinc-600 text-zinc-500 dark:text-zinc-500'
                  : isSkipped
                    ? 'text-zinc-500 dark:text-zinc-400'
                    : 'text-zinc-900 dark:text-zinc-100'
              }`}
              title={habit.name}
            >
              {habit.name}
            </h4>

            {/* Dynamic Wrapping Tags */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
              {isSkipped ? (
                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 whitespace-nowrap shrink-0 transition-colors">
                  <Snowflake className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>مُتخطّى</span>
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80 whitespace-nowrap transition-colors">
                  {habit.frequency === 'daily' ? 'يومي' : 'أسبوعي'}
                </span>
              )}

              <span
                className="text-[10px] text-zinc-300 dark:text-zinc-700 shrink-0 select-none"
                aria-hidden="true"
              >
                •
              </span>

              {stats.currentStreak > 0 ? (
                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20 whitespace-nowrap shrink-0 shadow-[0_1px_2px_rgba(249,115,22,0.1)] transition-colors">
                  <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current opacity-80" />
                  <span>{stats.currentStreak}</span>
                </span>
              ) : (
                <span className="text-[10px] sm:text-[11px] text-zinc-400 dark:text-zinc-500 font-medium truncate">
                  لا يوجد تسلسل
                </span>
              )}

              {targetProgress && (
                <>
                  <span
                    className="text-[10px] text-zinc-300 dark:text-zinc-700 shrink-0 select-none"
                    aria-hidden="true"
                  >
                    •
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold border whitespace-nowrap shrink-0 transition-colors ${
                      targetProgress.percent >= 100
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20'
                    }`}
                    title={`${targetProgress.period === 'week' ? 'الهدف الأسبوعي' : 'الهدف الشهري'}: ${targetProgress.completed} من ${targetProgress.target}`}
                  >
                    <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>
                      {targetProgress.completed} / {targetProgress.target}
                      <span className="hidden sm:inline ms-1 font-medium opacity-80">
                        {targetProgress.period === 'week' ? 'أسبوعي' : 'شهري'}
                      </span>
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </article>

      {/* Quick Action Dropdown */}
      <aside className="flex items-center shrink-0 ms-auto ps-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`إجراءات عادة ${habit.name}`}
              className="shrink-0 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 border border-transparent outline-none transition-all duration-300 ease-out active:scale-95 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 opacity-100 sm:opacity-0 sm:focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer group/btn"
            >
              <MoreHorizontal className="w-5 h-5 transition-transform duration-300 group-hover/btn:rotate-90" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="min-w-48 rounded-xl shadow-lg border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-1.5"
          >
            <DropdownMenuItem
              onClick={() => onSkip(habit.id)}
              disabled={isSkipping || isCompleted}
              aria-pressed={isSkipped}
              className={`rounded-lg transition-colors cursor-pointer ${
                isSkipped
                  ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400 focus:bg-sky-500/15 dark:focus:bg-sky-500/15'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              } ${isCompleted ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Snowflake className={`w-4 h-4 me-2 ${isSkipped ? 'text-sky-500' : ''}`} />
              <span className="font-medium">{isSkipped ? 'إلغاء تخطي' : 'تخطي اليوم'}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onNote(habit.id)}
              aria-pressed={hasNote}
              className={`rounded-lg transition-colors cursor-pointer mt-1 ${
                hasNote
                  ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 focus:bg-indigo-500/15 dark:focus:bg-indigo-500/15'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <NotebookPen className={`w-4 h-4 me-2 ${hasNote ? 'text-indigo-500' : ''}`} />
              <span className="font-medium">{hasNote ? 'تعديل ملاحظة' : 'إضافة ملاحظة'}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onEdit(habit)}
              className="rounded-lg transition-colors cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 mt-1"
            >
              <Edit3 className="w-4 h-4 me-2" />
              <span className="font-medium">تعديل العادة</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </aside>
    </Card>
  );
}
