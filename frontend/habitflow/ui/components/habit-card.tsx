import { createElement } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Flame, Edit3 } from 'lucide-react';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { HabitService } from '@/shared/habitflow/habit-service';
import { getIconComponent, getIconColorClass } from '@/frontend/habitflow/shared/habit-icons';
import { Card } from '@/frontend/ui/ui/card';
import { Button } from '@/frontend/ui/ui/button';

interface HabitCardProps {
  habit: Habit;
  logs: HabitLog[];
  activeDate: string;
  onToggle: (habitId: string) => void;
  onEdit: (habit: Habit) => void;
  togglingHabitId?: string | null;
}

export function HabitCard({
  habit,
  logs,
  activeDate,
  onToggle,
  onEdit,
  togglingHabitId,
}: HabitCardProps) {
  const reduce = useReducedMotion();
  const isCompleted = logs.some(
    (l) => l.habitId === habit.id && l.date === activeDate && l.completed
  );
  const isToggling = togglingHabitId === habit.id;
  const stats = HabitService.calculateHabitStats(habit.id, logs, activeDate);
  const colorClass = getIconColorClass(habit.icon);

  return (
    <Card
      className={`card-lift flex flex-row items-center justify-between p-3 sm:p-4 gap-2 transition-all duration-200 ease-out ${
        isCompleted ? 'border-primary/20 bg-primary/5' : ''
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <motion.button
          onClick={() => onToggle(habit.id)}
          disabled={isToggling}
          whileTap={reduce || isToggling ? undefined : { scale: 0.95 }}
          transition={reduce ? undefined : { type: 'spring', stiffness: 400, damping: 10 }}
          className={`w-10 sm:w-11 h-10 sm:h-11 rounded-full border-2 flex items-center justify-center transition-all duration-200 ease-out shrink-0 focus-ring touch-target btn-press ${
            isCompleted
              ? 'bg-primary border-primary text-primary-foreground shadow-sm'
              : 'border-border bg-card hover:border-muted-foreground'
          } ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
          aria-label={`${isCompleted ? 'إلغاء تسجيل' : 'تسجيل'} عادة ${habit.name}`}
          aria-pressed={isCompleted}
          id={`check-habit-${habit.id}`}
        >
          {isCompleted && (
            <motion.span
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={reduce ? undefined : { type: 'spring', stiffness: 500, damping: 15 }}
            >
              <Check className="w-4 h-4" />
            </motion.span>
          )}
        </motion.button>

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className={`w-9 sm:w-10 h-9 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}
          >
            {createElement(getIconComponent(habit.icon), { className: 'w-4 sm:w-5 h-4 sm:h-5' })}
          </div>
          <div className="min-w-0">
            <h4
              className={`text-sm font-bold leading-tight truncate ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}
            >
              {habit.name}
            </h4>
            <div className="flex items-center gap-1 mt-1 overflow-hidden">
              <span className="text-[10px] sm:text-xs font-semibold bg-muted text-muted-foreground uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
                {habit.frequency === 'daily' ? 'يومي' : 'أسبوعي'}
              </span>
              <span className="text-[10px] sm:text-xs text-border shrink-0">•</span>
              {stats.currentStreak > 0 ? (
                <span className="text-[10px] sm:text-xs font-bold bg-primary/10 text-primary flex items-center gap-1 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                  <Flame className="w-3 h-3" /> {stats.currentStreak}
                </span>
              ) : (
                <span className="text-[10px] sm:text-xs text-muted-foreground truncate">
                  لا يوجد تسلسل
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(habit)}
        aria-label={`تعديل عادة ${habit.name}`}
        id={`edit-habit-${habit.id}`}
        className="shrink-0 touch-target focus-ring btn-press"
      >
        <Edit3 className="w-4 h-4" />
      </Button>
    </Card>
  );
}
