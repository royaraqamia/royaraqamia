'use client';

import React from 'react';
import { useReducedMotion } from 'motion/react';
import { HabitLog } from '@/shared/contracts/habitflow';
import { Card } from '@/frontend/ui/primitives/card';
import { CalendarDays, Sparkles, CheckCircle2 } from 'lucide-react';

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

  // Calculate total completions across the grid for summary header stats

  return (
    <section className="w-full max-w-4xl mx-auto space-y-4 font-sans">
      {/* Header section with enhanced typography and metadata badges */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <CalendarDays className="w-5 h-5" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground leading-snug">
              سلسلة الإنجاز لآخر يوم
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pr-9 sm:pr-0">
            تصوير مرئي للاستمراريَّة اليوميَّة الإجماليَّة
          </p>
        </div>

        {habitsCount > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-secondary/80 text-secondary-foreground border border-border/60 shadow-xs backdrop-blur-xs">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>
                {habitsCount} {habitsCount === 1 ? 'عادة نشطة' : 'عادات نشطة'}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Main Container Card */}
      <Card className="p-4 sm:p-6 rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-xl shadow-black/5 hover:border-border/80 transition-all duration-300 card-lift">
        {habitsCount === 0 ? (
          /* High-end Empty State */
          <div className="text-center py-12 px-4 space-y-4 flex flex-col items-center justify-center bg-muted/20 rounded-2xl border border-dashed border-border/70">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-linear-to-b from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                <CalendarDays className="w-7 h-7" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary"></span>
              </span>
            </div>
            <div className="space-y-1.5 max-w-xs mx-auto">
              <p className="text-base font-bold text-foreground">لا توجد عادات بعد</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                أضِف عاداتك ليظهر تقويم الاستمراريَّة هنا ويبدأ تتبُّع إنجازاتك اليوميَّة
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Calendar Cells Grid */}
            <div className="grid grid-cols-5 gap-2.5 sm:gap-3.5">
              {calendarGrid.map((gridItem) => {
                const completedCount = logs.filter(
                  (l) => l.date === gridItem.date && l.completed
                ).length;
                const cellStyle = getCellStyle(completedCount, habitsCount);
                const dayNum = new Date(gridItem.date).getDate();

                const isToday = gridItem.isToday;
                const isSelected = gridItem.date === activeDate;

                const baseClass =
                  completedCount === 0
                    ? 'bg-muted/40 hover:bg-muted/80 border-border/60 text-muted-foreground'
                    : 'border-transparent shadow-xs';

                const todayRing = isToday
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background font-bold shadow-md shadow-primary/10'
                  : '';

                const activeRing =
                  isSelected && !isToday
                    ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-background'
                    : '';

                const motionClass = !reducedMotion
                  ? 'hover:scale-[1.05] hover:-translate-y-0.5 active:scale-[0.96]'
                  : '';

                return (
                  <button
                    key={gridItem.date}
                    type="button"
                    onClick={() => onDateSelect(gridItem.date)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onDateSelect(gridItem.date);
                      }
                    }}
                    style={cellStyle}
                    role="button"
                    tabIndex={0}
                    aria-label={`${completedCount} / ${habitsCount} عادات مكتملة في ${gridItem.date}`}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={isSelected}
                    className={`
                      relative group aspect-square rounded-2xl flex flex-col items-center justify-center 
                      border p-1 sm:p-2 text-center transition-all duration-200 ease-out cursor-pointer 
                      select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary 
                      focus-visible:ring-offset-2 focus-visible:ring-offset-background touch-manipulation
                      btn-press touch-target focus-ring will-change-transform
                      ${motionClass} ${baseClass} ${todayRing} ${activeRing}
                    `}
                  >
                    {/* Glowing indicator dot for Today */}
                    {isToday && (
                      <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                    )}

                    <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider opacity-80 leading-none mb-1 group-hover:opacity-100 transition-opacity">
                      {gridItem.dayLabel}
                    </span>

                    <span className="text-sm sm:text-base font-extrabold leading-none tracking-tight">
                      {dayNum}
                    </span>

                    {/* Completion status pill inside cell */}
                    {completedCount > 0 && (
                      <span className="mt-1 text-[9px] sm:text-[10px] font-bold opacity-90 leading-none px-1.5 py-0.5 rounded-full bg-black/10 dark:bg-white/10 backdrop-blur-xs flex items-center gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5 inline-block" />
                        {completedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bottom Heatmap Legend Bar */}
            <footer className="pt-3.5 border-t border-border/50 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/40 border border-border/50 shadow-2xs">
                <span className="w-2.5 h-2.5 rounded-xs bg-muted border border-border shrink-0" />
                <span className="font-medium text-foreground/80">بدون</span>
              </div>

              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-muted/40 border border-border/50 shadow-2xs">
                <span className="text-xs text-muted-foreground font-medium">أقل</span>
                <div className="flex items-center gap-1.5">
                  {[0.15, 0.45, 0.7, 0.9].map((pct) => {
                    const fill = Math.max(0.08, Math.min(1, pct * 0.85 + 0.15));
                    return (
                      <span
                        key={pct}
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-md shrink-0 transition-transform duration-200 hover:scale-125"
                        style={{
                          background: `
                            repeating-linear-gradient(45deg, transparent, transparent ${Math.max(1, 10 - Math.round(fill * 8))}px, color-mix(in srgb, var(--primary) ${Math.round(fill * 30)}%, transparent) ${Math.max(1, 10 - Math.round(fill * 8))}px, color-mix(in srgb, var(--primary) ${Math.round(fill * 30)}%, transparent) ${Math.max(2, 10 - Math.round(fill * 8) + Math.max(1, Math.round(fill * 3)))}px),
                            color-mix(in srgb, var(--primary) ${Math.round(fill * 100)}%, transparent)
                          `,
                          border: `1px solid color-mix(in srgb, var(--primary) ${Math.round(fill * 60)}%, transparent)`,
                        }}
                      />
                    );
                  })}
                </div>
                <span className="text-xs text-muted-foreground font-medium">أكثر</span>
              </div>
            </footer>
          </div>
        )}
      </Card>
    </section>
  );
}
