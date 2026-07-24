'use client';

import { useReducedMotion } from 'motion/react';
import { HabitLog } from '@/domains/habitflow/models';
import { Card } from '@/components/ui/card';
import { CalendarDays } from 'lucide-react';

interface CalendarGridProps {
  calendarGrid: { date: string; dayLabel: string; isToday: boolean }[];
  logs: HabitLog[];
  habitsCount: number;
  onDateSelect: (date: string) => void;
  activeDate: string;
}

function getCellStyle(completedCount: number, totalCount: number): React.CSSProperties {
  if (totalCount === 0 || completedCount === 0) return {};

  const pct = completedCount / totalCount;
  const fill = Math.max(0.08, Math.min(1, pct * 0.85 + 0.15));
  const stripeGap = Math.max(3, 10 - Math.round(fill * 8));
  const stripeWidth = Math.max(1, Math.round(fill * 3));

  return {
    background: `
      repeating-linear-gradient(
        45deg,
        transparent,
        transparent ${stripeGap}px,
        color-mix(in srgb, var(--primary) ${Math.round(fill * 30)}%, transparent) ${stripeGap}px,
        color-mix(in srgb, var(--primary) ${Math.round(fill * 30)}%, transparent) ${stripeGap + stripeWidth}px
      ),
      color-mix(in srgb, var(--primary) ${Math.round(fill * 100)}%, transparent)
    `,
    borderColor: `color-mix(in srgb, var(--primary) ${Math.round(fill * 60)}%, transparent)`,
    color: fill > 0.55 ? 'var(--primary-foreground)' : undefined,
    fontWeight: fill > 0.75 ? 600 : undefined,
  };
}

export function CalendarGrid({
  calendarGrid,
  logs,
  habitsCount,
  onDateSelect,
  activeDate,
}: CalendarGridProps) {
  const reducedMotion = useReducedMotion();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-fluid-h2 font-display font-bold text-foreground leading-snug">
          سلسلة الإنجاز لآخر ٣٠ يوم
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          تصوير مرئي للاستمرارية اليومية الإجمالية
        </p>
      </div>

      <Card className="p-5 space-y-4 card-lift">
        {habitsCount === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
              <CalendarDays className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">لا توجد عادات بعد</p>
            <p className="text-xs text-muted-foreground">أضف عاداتك ليظهر تقويم الاستمرارية هنا</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-3">
              {calendarGrid.map((gridItem) => {
                const completedCount = logs.filter(
                  (l) => l.date === gridItem.date && l.completed
                ).length;
                const cellStyle = getCellStyle(completedCount, habitsCount);
                const baseClass = completedCount === 0 ? 'bg-muted border-border' : 'border';
                const todayClass = gridItem.isToday
                  ? ' ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : '';
                const activeClass =
                  gridItem.date === activeDate && !gridItem.isToday
                    ? ' ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : '';

                const dayNum = new Date(gridItem.date).getDate();

                return (
                  <div
                    key={gridItem.date}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center border text-center transition-all duration-200 ease-out cursor-pointer ${!reducedMotion ? 'hover:scale-105' : ''} btn-press touch-target focus-ring will-change-transform ${baseClass}${todayClass}${activeClass}`}
                    style={cellStyle}
                    onClick={() => onDateSelect(gridItem.date)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onDateSelect(gridItem.date);
                    }}
                    aria-label={`${completedCount} / ${habitsCount} عادات مكتملة في ${gridItem.date}`}
                    aria-current={gridItem.isToday ? 'date' : undefined}
                    aria-pressed={gridItem.date === activeDate}
                  >
                    <span className="text-xs text-muted-foreground uppercase leading-none">
                      {gridItem.dayLabel}
                    </span>
                    <span className="text-xs font-bold mt-1 leading-none">{dayNum}</span>
                  </div>
                );
              })}
            </div>
            <div className="pt-2 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-muted border border-border shrink-0"></span>{' '}
                بدون
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">أقل</span>
                {[15, 40, 65, 90].map((pct) => (
                  <span
                    key={pct}
                    className="w-4 h-4 rounded shrink-0"
                    style={{
                      background: `
                        repeating-linear-gradient(45deg, transparent, transparent ${Math.max(1, 8 - Math.round(pct / 15))}px, color-mix(in srgb, var(--primary) ${Math.round(pct * 0.3)}%, transparent) ${Math.max(1, 8 - Math.round(pct / 15))}px, color-mix(in srgb, var(--primary) ${Math.round(pct * 0.3)}%, transparent) ${Math.max(2, 10 - Math.round(pct / 12))}px),
                        color-mix(in srgb, var(--primary) ${pct}%, transparent)
                      `,
                      border: `1px solid color-mix(in srgb, var(--primary) ${Math.round(pct * 0.5)}%, transparent)`,
                    }}
                  />
                ))}
                <span className="text-xs text-muted-foreground">أكثر</span>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
