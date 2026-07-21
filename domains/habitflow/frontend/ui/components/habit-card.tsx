import { createElement } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Flame, Edit3 } from 'lucide-react';
import { Habit, HabitLog } from '@/domains/habitflow/models';
import { HabitService } from '@/domains/habitflow/services/habit-service';
import {
  getIconComponent,
  getIconColorClass,
} from '@/domains/habitflow/frontend/shared/habit-icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
      className={`flex items-center justify-between p-4 transition-all duration-200 ease-out ${
        isCompleted ? 'border-primary/20 bg-primary/5' : ''
      }`}
    >
      <div className="flex items-center gap-4">
        <motion.button
          onClick={() => onToggle(habit.id)}
          disabled={isToggling}
          whileTap={reduce || isToggling ? undefined : { scale: 0.85 }}
          transition={reduce ? undefined : { type: 'spring', stiffness: 400, damping: 10 }}
          className={`w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-200 ease-out shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            isCompleted
              ? 'bg-primary border-primary text-primary-foreground shadow-sm'
              : 'border-input bg-background hover:border-muted-foreground'
          } ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
          aria-label={`${isCompleted ? 'إلغاء تسجيل' : 'تسجيل'} عادة ${habit.name}`}
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

        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
            {createElement(getIconComponent(habit.icon), { className: 'w-5 h-5' })}
          </div>
          <div>
            <h4
              className={`text-sm font-bold leading-tight line-clamp-1 ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}
            >
              {habit.name}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {habit.frequency}
              </span>
              <span className="text-xs text-border">•</span>
              {stats.currentStreak > 0 ? (
                <span className="text-xs font-bold text-destructive flex items-center gap-1">
                  <Flame className="w-3 h-3" /> {stats.currentStreak} أيام متتالية
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">لم يبدأ التسلسل بعد</span>
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
        className="min-w-[44px] min-h-[44px]"
      >
        <Edit3 className="w-4 h-4" />
      </Button>
    </Card>
  );
}
