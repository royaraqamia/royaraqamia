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

  return (
    <section
      dir="rtl"
      className="relative w-full max-w-4xl mx-auto space-y-6 sm:space-y-8 font-sans antialiased text-foreground selection:bg-primary/20 selection:text-primary"
    >
      {/* Background ambient lighting glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-3/4 max-w-2xl h-40 bg-linear-to-r from-primary/15 via-primary/8 to-transparent blur-3xl opacity-60 rounded-full"
      />

      {/* Refined Header Section */}
      <header className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
        <div className="flex items-center gap-3.5 sm:gap-4">
          <div className="relative flex items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-linear-to-br from-primary/20 via-primary/10 to-transparent text-primary border border-primary/20 shadow-xs ring-1 ring-primary/10 shrink-0">
            <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
            <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-xs" />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-foreground leading-snug">
              سلسلة الإنجاز
            </h2>
          </div>
        </div>

        {habitsCount > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/25 shadow-2xs backdrop-blur-md transition-all duration-300 hover:bg-primary/20 hover:border-primary/40 hover:scale-[1.02] active:scale-[0.98]">
              <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" aria-hidden="true" />
              <span>
                {habitsCount} {habitsCount === 1 ? 'عادة نشطة' : 'عادات نشطة'}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Main Glassmorphic Container Card */}
      <Card className="relative overflow-hidden p-3.5 sm:p-6 md:p-8 rounded-3xl sm:rounded-4xl border border-border/50 bg-card/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] hover:border-border/80 transition-all duration-500 ease-out group/card">
        {habitsCount === 0 ? (
          /* High-End Empty State */
          <div className="relative overflow-hidden py-12 sm:py-16 px-6 text-center space-y-5 flex flex-col items-center justify-center bg-linear-to-b from-muted/20 via-muted/10 to-transparent rounded-2xl sm:rounded-3xl border-2 border-dashed border-border/60 transition-colors duration-300 group-hover/card:border-border/90">
            <div className="relative flex items-center justify-center">
              <div className="absolute -inset-3 rounded-full bg-primary/15 blur-xl animate-pulse" />
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-linear-to-br from-primary/20 via-primary/10 to-background border border-primary/25 flex items-center justify-center text-primary shadow-xs ring-1 ring-primary/10">
                <CalendarDays className="w-8 h-8 sm:w-10 sm:h-10 opacity-90" aria-hidden="true" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-primary border-2 border-background shadow-xs"></span>
              </span>
            </div>

            <div className="space-y-2 max-w-sm mx-auto">
              <h3 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">
                لا توجد عادات بعد
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed balance-text">
                أضِف عاداتك ليظهر تقويم الاستمراريَّة هنا ويبدأ تتبُّع إنجازاتك اليوميَّة
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {/* Calendar Grid Cells */}
            <div className="grid grid-cols-5 gap-2 sm:gap-3.5 md:gap-4 lg:gap-5">
              {calendarGrid.map((gridItem) => {
                const completedCount = logs.filter(
                  (l) => l.date === gridItem.date && l.completed
                ).length;
                const cellStyle = getCellStyle(completedCount, habitsCount);
                const dayNum = gridItem.date.includes('-')
                  ? parseInt(gridItem.date.split('-').pop() || '0', 10) ||
                    new Date(gridItem.date).getDate()
                  : new Date(gridItem.date).getDate();

                const isToday = gridItem.isToday;
                const isSelected = gridItem.date === activeDate;

                // Dynamic state styling logic
                const baseClass =
                  completedCount === 0
                    ? 'bg-muted/20 hover:bg-muted/40 border-border/40 text-muted-foreground/80 hover:text-foreground hover:border-border/80'
                    : 'border-transparent shadow-2xs hover:shadow-lg hover:shadow-primary/10 text-foreground';

                const todayRing = isToday
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background z-20 shadow-md shadow-primary/20'
                  : '';

                const activeRing =
                  isSelected && !isToday
                    ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-background z-10 shadow-sm'
                    : '';

                const motionClass = !reducedMotion
                  ? 'transition-all duration-300 ease-out hover:scale-[1.04] hover:-translate-y-1 active:scale-[0.96] active:translate-y-0 active:duration-150'
                  : 'transition-colors duration-200';

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
                    aria-label={`${completedCount} من أصل ${habitsCount} عادات مكتملة في ${gridItem.date}${isToday ? ' (اليوم)' : ''}`}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={isSelected}
                    className={`
                      relative group aspect-square rounded-xl sm:rounded-2xl flex flex-col items-center justify-between
                      p-1.5 sm:p-2.5 md:p-3 text-center cursor-pointer select-none outline-none border
                      focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background 
                      touch-manipulation will-change-transform
                      ${motionClass} ${baseClass} ${todayRing} ${activeRing}
                    `}
                  >
                    {/* Top band: Day Label & Today Live Indicator */}
                    <div className="w-full relative flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground/80 group-hover:text-foreground transition-colors truncate">
                        {gridItem.dayLabel}
                      </span>
                      {isToday && (
                        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]"></span>
                        </span>
                      )}
                    </div>

                    {/* Middle band: Centered Day Number */}
                    <span className="text-sm sm:text-2xl md:text-3xl font-extrabold tracking-tight leading-none my-auto">
                      {dayNum}
                    </span>

                    {/* Bottom band: Completed Habits Pill Badge */}
                    <div className="h-4 sm:h-5 flex items-center justify-center w-full">
                      {completedCount > 0 ? (
                        <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] font-extrabold leading-none px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full bg-background/85 text-foreground border border-border/60 backdrop-blur-md shadow-2xs transition-transform duration-300 group-hover:scale-105">
                          <CheckCircle2
                            className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary shrink-0"
                            aria-hidden="true"
                          />
                          <span>{completedCount}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] opacity-0 group-hover:opacity-40 transition-opacity font-medium">
                          0
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Heatmap Legend Bar */}
          </div>
        )}
      </Card>
    </section>
  );
}
