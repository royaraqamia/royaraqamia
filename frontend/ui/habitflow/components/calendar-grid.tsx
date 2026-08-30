'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';
import { HabitLog } from '@/shared/contracts/habitflow';
import { LucideIcon, TrendingUp } from 'lucide-react';
import { Card } from '@/frontend/ui/primitives/card';
import {
  formatArabicDate,
  extractDayNumber,
  isDayFrozen,
  pluralize,
  type PluralForms,
} from '@/frontend/shared/habitflow/calendar-format';
import {
  CalendarDays,
  Sparkles,
  CheckCircle2,
  Snowflake,
  Flame,
  Trophy,
  Calendar as CalendarIcon,
  Star,
  Info,
} from 'lucide-react';

export interface CalendarGridProps {
  calendarGrid: { date: string; dayLabel: string; isToday: boolean }[];
  logs: HabitLog[];
  habitsCount: number;
  onDateSelect: (date: string) => void;
  activeDate: string;
  className?: string;
}

const GRID_COLUMNS = 5;

const DAY_FORMS: PluralForms = { one: 'يوم', two: 'يومين', few: 'أيام', other: 'يوم' };
const PERFECT_DAY_FORMS: PluralForms = {
  one: 'يوم ممتاز',
  two: 'يومان ممتازان',
  few: 'أيام ممتازة',
  other: 'يومًا ممتازًا',
};
const HABIT_FORMS: PluralForms = {
  one: 'عادة',
  two: 'عادتين',
  few: 'عادات',
  other: 'عادة',
};
const FREEZE_HABIT_FORMS: PluralForms = {
  one: 'عادة مجمدة',
  two: 'عادتان مجمدتان',
  few: 'عادات مجمدة',
  other: 'عادة مجمدة',
};
const ACTIVE_HABIT_FORMS: PluralForms = {
  one: 'عادة نشطة',
  two: 'عادتان نشطتان',
  few: 'عادات نشطة',
  other: 'عادة نشطة',
};
const TIME_FORMS: PluralForms = { one: 'مرة', two: 'مرتين', few: 'مرات', other: 'مرة' };

interface MetricCardProps {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  unit?: string;
}

function MetricCard({ icon: Icon, iconClassName, label, value, unit }: MetricCardProps) {
  return (
    <div className="flex items-center gap-2.5 @min-[440px]:gap-3 min-w-0 p-2.5 @min-[440px]:p-3 rounded-xl bg-card/40 border border-border/40 backdrop-blur-xl">
      <div
        className={`flex items-center justify-center shrink-0 w-8 h-8 @min-[440px]:w-9 @min-[440px]:h-9 rounded-lg border ${iconClassName}`}
      >
        <Icon className="w-4 h-4 @min-[440px]:w-[18px] @min-[440px]:h-[18px]" aria-hidden="true" />
      </div>
      <div className="flex flex-col justify-center min-w-0 gap-1">
        <span className="text-[10px] @min-[440px]:text-[11px] font-medium text-muted-foreground truncate leading-none">
          {label}
        </span>
        <span className="text-sm @min-[440px]:text-base font-black tracking-tight text-foreground tabular-nums truncate leading-none">
          {value}
          {unit ? (
            <span className="ms-1 text-[10px] @min-[440px]:text-xs font-normal text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export function CalendarGrid({
  calendarGrid,
  logs,
  habitsCount,
  onDateSelect,
  activeDate,
  className = '',
}: CalendarGridProps) {
  const reducedMotion = useReducedMotion();
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Index logs by date once to avoid O(days × logs) rescans
  const logsByDate = useMemo(() => {
    const index = new Map<string, HabitLog[]>();
    for (const log of logs) {
      const bucket = index.get(log.date);
      if (bucket) {
        bucket.push(log);
      } else {
        index.set(log.date, [log]);
      }
    }
    return index;
  }, [logs]);

  // Derive rich period metrics
  const stats = useMemo(() => {
    if (habitsCount === 0 || calendarGrid.length === 0) {
      return {
        completionRate: 0,
        perfectDays: 0,
        totalCompleted: 0,
        freezeDays: 0,
        totalPossible: 0,
      };
    }

    let totalCompleted = 0;
    let perfectDays = 0;
    let freezeDays = 0;

    calendarGrid.forEach((item) => {
      const dayLogs = logsByDate.get(item.date) ?? [];
      const completed = dayLogs.filter((l) => l.completed).length;

      totalCompleted += completed;
      if (completed >= habitsCount) {
        perfectDays += 1;
      }
      if (isDayFrozen(dayLogs)) {
        freezeDays += 1;
      }
    });

    const totalPossible = habitsCount * calendarGrid.length;
    const completionRate =
      totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    return {
      completionRate,
      perfectDays,
      totalCompleted,
      freezeDays,
      totalPossible,
    };
  }, [calendarGrid, logsByDate, habitsCount]);

  // Selected date details
  const activeDayDetails = useMemo(() => {
    const targetDate = hoveredDate || activeDate;
    const gridItem = calendarGrid.find((g) => g.date === targetDate);
    if (!gridItem) return null;

    const dayLogs = logsByDate.get(targetDate) ?? [];
    const completedCount = dayLogs.filter((l) => l.completed).length;
    const skipCount = dayLogs.filter((l) => l.kind === 'skip').length;
    const pct = habitsCount > 0 ? Math.round((completedCount / habitsCount) * 100) : 0;
    const isPerfect = habitsCount > 0 && completedCount >= habitsCount;

    return {
      date: targetDate,
      formattedDate: formatArabicDate(targetDate),
      dayLabel: gridItem.dayLabel,
      isToday: gridItem.isToday,
      completedCount,
      skipCount,
      pct,
      isPerfect,
    };
  }, [hoveredDate, activeDate, calendarGrid, logsByDate, habitsCount]);

  // Find today item for quick jump
  const todayItem = useMemo(() => calendarGrid.find((item) => item.isToday), [calendarGrid]);

  // Split the grid into fixed-width rows for valid role="grid" markup
  const gridRows = useMemo(() => {
    const rows: { date: string; dayLabel: string; isToday: boolean }[][] = [];
    for (let i = 0; i < calendarGrid.length; i += GRID_COLUMNS) {
      rows.push(calendarGrid.slice(i, i + GRID_COLUMNS));
    }
    return rows;
  }, [calendarGrid]);

  // Guarantee exactly one roving tab stop even when activeDate isn't in the grid
  const hasSelectedCell = useMemo(
    () => calendarGrid.some((item) => item.date === activeDate),
    [calendarGrid, activeDate]
  );

  // Keyboard navigation across grid
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      const total = calendarGrid.length;

      let targetIndex: number | null;
      switch (e.key) {
        case 'ArrowRight': // RTL Next is Left, Previous is Right
          targetIndex = currentIndex > 0 ? currentIndex - 1 : null;
          break;
        case 'ArrowLeft':
          targetIndex = currentIndex < total - 1 ? currentIndex + 1 : null;
          break;
        case 'ArrowUp':
          targetIndex = currentIndex - GRID_COLUMNS >= 0 ? currentIndex - GRID_COLUMNS : null;
          break;
        case 'ArrowDown':
          targetIndex = currentIndex + GRID_COLUMNS < total ? currentIndex + GRID_COLUMNS : null;
          break;
        case 'Home':
          targetIndex = 0;
          break;
        case 'End':
          targetIndex = total - 1;
          break;
        default:
          return;
      }

      if (targetIndex !== null) {
        const targetItem = calendarGrid[targetIndex];
        if (targetItem) {
          e.preventDefault();
          onDateSelect(targetItem.date);
          const buttons =
            gridContainerRef.current?.querySelectorAll<HTMLButtonElement>('button[data-cell]');
          buttons?.[targetIndex]?.focus();
        }
      }
    },
    [calendarGrid, onDateSelect]
  );

  return (
    <section
      dir="rtl"
      aria-label="تقويم سلسلة الإنجاز"
      className={`@container relative w-full mx-auto space-y-4 @min-[440px]:space-y-5 @min-[560px]:space-y-6 font-sans antialiased text-foreground selection:bg-primary/20 selection:text-primary ${className}`}
    >
      {/* Dynamic Ambient Background Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-full max-w-2xl h-48 @min-[560px]:h-56 bg-linear-to-r from-primary/20 via-primary/10 to-transparent blur-3xl opacity-70 rounded-full dark:opacity-40"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 right-10 w-64 h-64 bg-primary/10 blur-3xl rounded-full opacity-50"
      />

      {/* Header Section */}
      <header className="relative flex items-start justify-between gap-3 pb-4 @min-[440px]:pb-5 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex items-center justify-center shrink-0 w-10 h-10 @min-[440px]:w-12 @min-[440px]:h-12 rounded-xl @min-[440px]:rounded-2xl bg-linear-to-br from-primary/25 via-primary/10 to-background border border-primary/30 text-primary shadow-sm ring-1 ring-primary/20">
            <CalendarDays
              className="w-5 h-5 @min-[440px]:w-6 @min-[440px]:h-6"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg @min-[520px]:text-2xl font-black text-foreground whitespace-nowrap leading-tight">
                سلسلة الإنجاز
              </h2>
              {stats.perfectDays > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] @min-[440px]:text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
                  <Flame
                    className="w-3 h-3 text-amber-500 fill-amber-500 animate-pulse motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  <span>
                    {stats.perfectDays} {pluralize(stats.perfectDays, PERFECT_DAY_FORMS)}
                  </span>
                </span>
              )}
            </div>
            <p className="text-xs @min-[440px]:text-sm text-muted-foreground font-medium leading-snug line-clamp-1 @min-[520px]:line-clamp-none">
              تتبّع وتيرة التزامك اليومي وحافظ على استمراريّة عاداتك
            </p>
          </div>
        </div>

        {/* Header Actions & Badges */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {todayItem && activeDate !== todayItem.date && (
            <button
              type="button"
              onClick={() => onDateSelect(todayItem.date)}
              className="inline-flex items-center gap-1.5 px-2.5 @min-[440px]:px-3 py-1.5 rounded-lg @min-[440px]:rounded-xl text-[11px] @min-[440px]:text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 border border-border/50 backdrop-blur-md transition-all duration-200 active:scale-95 cursor-pointer motion-reduce:transform-none motion-reduce:transition-none"
              title="الانتقال إلى تاريخ اليوم"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-primary" />
              <span>اليوم</span>
            </button>
          )}

          {habitsCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-2.5 @min-[440px]:px-3.5 py-1.5 rounded-lg @min-[440px]:rounded-xl text-[11px] @min-[440px]:text-xs font-extrabold bg-linear-to-r from-primary/15 via-primary/10 to-primary/5 text-primary border border-primary/30 backdrop-blur-md whitespace-nowrap">
              <Sparkles
                className="w-3.5 h-3.5 text-primary animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span>
                {habitsCount} {pluralize(habitsCount, ACTIVE_HABIT_FORMS)}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Quick Metrics Ribbon (Only shown if habits exist) */}
      {habitsCount > 0 && (
        <div className="grid grid-cols-2 @min-[560px]:grid-cols-4 gap-2 @min-[440px]:gap-2.5">
          <MetricCard
            icon={TrendingUp}
            iconClassName="bg-primary/10 border-primary/20 text-primary"
            label="معدل الإنجاز"
            value={`${stats.completionRate}%`}
          />
          <MetricCard
            icon={Trophy}
            iconClassName="bg-amber-500/10 border-amber-500/20 text-amber-500"
            label="أيام مكتملة 100%"
            value={`${stats.perfectDays}`}
            unit={pluralize(stats.perfectDays, DAY_FORMS)}
          />
          <MetricCard
            icon={CheckCircle2}
            iconClassName="bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
            label="العادات المنجزة"
            value={`${stats.totalCompleted}`}
            unit={pluralize(stats.totalCompleted, TIME_FORMS)}
          />
          <MetricCard
            icon={Snowflake}
            iconClassName="bg-sky-500/10 border-sky-500/20 text-sky-500"
            label="أيام التجميد"
            value={`${stats.freezeDays}`}
            unit={pluralize(stats.freezeDays, DAY_FORMS)}
          />
        </div>
      )}

      {/* Main Glassmorphic Container Card */}
      <Card className="relative overflow-hidden p-3 @min-[440px]:p-5 @min-[560px]:p-6 rounded-2xl @min-[440px]:rounded-3xl border border-border/50 bg-card/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] transition-all duration-300 motion-reduce:transition-none">
        {habitsCount === 0 ? (
          /* High-End Empty State */
          <div className="relative overflow-hidden py-10 @min-[440px]:py-14 px-4 @min-[440px]:px-6 text-center space-y-5 @min-[440px]:space-y-6 flex flex-col items-center justify-center bg-linear-to-b from-muted/20 via-muted/5 to-transparent rounded-2xl border-2 border-dashed border-border/60">
            <div className="relative flex items-center justify-center">
              <div className="absolute -inset-4 rounded-full bg-primary/20 blur-2xl animate-pulse motion-reduce:animate-none" />
              <div className="relative w-16 h-16 @min-[440px]:w-20 @min-[440px]:h-20 rounded-2xl @min-[440px]:rounded-3xl bg-linear-to-br from-primary/20 via-primary/10 to-background border border-primary/30 flex items-center justify-center text-primary shadow-lg ring-1 ring-primary/20">
                <CalendarDays
                  className="w-8 h-8 @min-[440px]:w-10 @min-[440px]:h-10 opacity-90"
                  aria-hidden="true"
                />
              </div>
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5">
                <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-primary border-2 border-background shadow-xs"></span>
              </span>
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="text-lg @min-[440px]:text-2xl font-black text-foreground">
                لا توجد عادات نشطة بعد
              </h3>
              <p className="text-xs @min-[440px]:text-sm text-muted-foreground leading-relaxed">
                أضِف عاداتك اليومية لتبدأ في بناء سلسلة الاستمرارية وتتبّع نموّك خطوة بخطوة في هذا
                التقويم
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 @min-[440px]:space-y-5 @min-[560px]:space-y-6">
            {/* Calendar Grid Cells */}
            <div
              ref={gridContainerRef}
              role="grid"
              aria-label="شبكة أيام الإنجاز"
              className="space-y-1.5 @min-[440px]:space-y-2.5"
            >
              {gridRows.map((row, rowIndex) => (
                <div
                  key={`row-${rowIndex}`}
                  role="row"
                  className="grid grid-cols-5 gap-1.5 @min-[440px]:gap-2.5"
                >
                  {row.map((gridItem, colIndex) => {
                    const idx = rowIndex * GRID_COLUMNS + colIndex;
                    const dayLogs = logsByDate.get(gridItem.date) ?? [];
                    const completedCount = dayLogs.filter((l) => l.completed).length;
                    const skipCount = dayLogs.filter((l) => l.kind === 'skip').length;
                    const dayNum = extractDayNumber(gridItem.date);

                    const isToday = gridItem.isToday;
                    const isSelected = gridItem.date === activeDate;

                    const completionRatio = habitsCount > 0 ? completedCount / habitsCount : 0;
                    const isPerfectDay = completedCount >= habitsCount && habitsCount > 0;
                    const isFrozenDay = isDayFrozen(dayLogs);

                    // Color tier generation
                    let cellBackground =
                      'bg-muted/15 hover:bg-muted/30 border-border/40 text-muted-foreground/90';
                    let glowRing = '';

                    if (isFrozenDay) {
                      cellBackground =
                        'bg-sky-500/10 hover:bg-sky-500/15 border-sky-400/35 text-sky-700 dark:text-sky-300 shadow-2xs';
                    } else if (isPerfectDay) {
                      cellBackground =
                        'bg-linear-to-br from-primary/35 via-primary/20 to-amber-500/15 hover:from-primary/45 hover:via-primary/30 hover:to-amber-500/25 border-primary/50 text-foreground font-bold shadow-md shadow-primary/10';
                    } else if (completedCount > 0) {
                      const opacityTier =
                        completionRatio >= 0.75
                          ? 'bg-primary/25 hover:bg-primary/35 border-primary/45'
                          : completionRatio >= 0.4
                            ? 'bg-primary/15 hover:bg-primary/25 border-primary/35'
                            : 'bg-primary/10 hover:bg-primary/15 border-primary/25';
                      cellBackground = `${opacityTier} text-foreground shadow-2xs`;
                    }

                    if (isSelected) {
                      glowRing =
                        'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/25 z-20 scale-[1.02] @min-[440px]:scale-[1.03]';
                    } else if (isToday) {
                      glowRing = 'ring-2 ring-primary/80 ring-offset-2 ring-offset-background z-10';
                    }

                    return (
                      <div
                        key={gridItem.date}
                        role="gridcell"
                        aria-selected={isSelected}
                        className="relative aspect-square rounded-xl @min-[440px]:rounded-2xl"
                      >
                        <button
                          data-cell
                          type="button"
                          tabIndex={isSelected || (!hasSelectedCell && idx === 0) ? 0 : -1}
                          onClick={() => onDateSelect(gridItem.date)}
                          onMouseEnter={() => setHoveredDate(gridItem.date)}
                          onMouseLeave={() => setHoveredDate(null)}
                          onFocus={() => setHoveredDate(gridItem.date)}
                          onBlur={() => setHoveredDate(null)}
                          onKeyDown={(e) => handleKeyDown(e, idx)}
                          aria-label={`${gridItem.dayLabel}، ${dayNum}: ${completedCount} من أصل ${habitsCount} ${pluralize(habitsCount, HABIT_FORMS)}${
                            skipCount > 0
                              ? `، ${skipCount} ${pluralize(skipCount, FREEZE_HABIT_FORMS)}`
                              : ''
                          }${isToday ? ' (اليوم)' : ''}`}
                          aria-current={isToday ? 'date' : undefined}
                          className={`
                            relative group w-full h-full rounded-xl @min-[440px]:rounded-2xl
                            flex flex-col items-center justify-center
                            text-center cursor-pointer select-none outline-none border
                            focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
                            touch-manipulation overflow-hidden
                            transition-all duration-200 ease-out hover:scale-[1.04] active:scale-[0.97]
                            motion-reduce:transform-none motion-reduce:transition-none
                            ${cellBackground} ${glowRing}
                          `}
                        >
                          {/* Perfect Day Shimmering Glow Accent */}
                          {isPerfectDay && (
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 bg-linear-to-tr from-amber-400/10 via-primary/10 to-transparent pointer-events-none"
                            />
                          )}

                          {/* Status Indicators */}
                          <div className="absolute top-1 @min-[440px]:top-1.5 start-1 @min-[440px]:start-1.5 flex items-center gap-0.5 z-10">
                            {isPerfectDay && (
                              <Star
                                className="w-2.5 h-2.5 @min-[440px]:w-3 @min-[440px]:h-3 text-amber-500 fill-amber-500 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            {isFrozenDay && (
                              <Snowflake
                                className="w-2.5 h-2.5 @min-[440px]:w-3 @min-[440px]:h-3 text-sky-500 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            {isToday && (
                              <span
                                className="relative flex h-1.5 w-1.5 @min-[440px]:h-2 @min-[440px]:w-2"
                                aria-hidden="true"
                              >
                                <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-primary opacity-80" />
                                <span className="relative inline-flex rounded-full h-full w-full bg-primary" />
                              </span>
                            )}
                          </div>

                          {/* Day Number */}
                          <span className="text-base @min-[440px]:text-xl @min-[560px]:text-2xl font-black tracking-tight leading-none tabular-nums text-foreground">
                            {dayNum}
                          </span>

                          {/* Progress Fill — rendered only when there is progress */}
                          {completionRatio > 0 && (
                            <div
                              aria-hidden="true"
                              className="absolute bottom-1 @min-[440px]:bottom-1.5 inset-x-1.5 @min-[440px]:inset-x-2.5 h-0.5 @min-[440px]:h-1 bg-foreground/10 rounded-full overflow-hidden"
                            >
                              <div
                                className={`h-full rounded-full transition-all duration-500 motion-reduce:transition-none ${
                                  isPerfectDay
                                    ? 'bg-linear-to-r from-primary to-amber-400'
                                    : isFrozenDay
                                      ? 'bg-sky-400'
                                      : 'bg-primary'
                                }`}
                                style={{
                                  width: `${isFrozenDay ? 100 : Math.min(100, completionRatio * 100)}%`,
                                }}
                              />
                            </div>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Selected / Hovered Day Inspector Banner */}
            <AnimatePresence mode="wait">
              {activeDayDetails && (
                <m.div
                  key={activeDayDetails.date}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
                  className="relative overflow-hidden p-3.5 @min-[440px]:p-4 @min-[560px]:p-5 rounded-2xl bg-linear-to-r from-muted/30 via-muted/15 to-transparent border border-border/50"
                >
                  <div className="flex flex-col @min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:justify-between gap-3 @min-[560px]:gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 @min-[560px]:w-10 @min-[560px]:h-10 rounded-xl @min-[560px]:rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        {activeDayDetails.isPerfect ? (
                          <Trophy className="w-4.5 h-4.5 @min-[560px]:w-5 @min-[560px]:h-5 text-amber-500" />
                        ) : activeDayDetails.completedCount > 0 ? (
                          <CalendarIcon className="w-4.5 h-4.5 @min-[560px]:w-5 @min-[560px]:h-5" />
                        ) : activeDayDetails.skipCount > 0 ? (
                          <Snowflake className="w-4.5 h-4.5 @min-[560px]:w-5 @min-[560px]:h-5 text-sky-500" />
                        ) : (
                          <CalendarIcon className="w-4.5 h-4.5 @min-[560px]:w-5 @min-[560px]:h-5" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm @min-[560px]:text-base font-black text-foreground leading-tight">
                            {activeDayDetails.formattedDate}
                          </h4>
                          {activeDayDetails.isToday && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary/20 text-primary border border-primary/30 shrink-0">
                              اليوم
                            </span>
                          )}
                        </div>
                        <p className="text-xs @min-[560px]:text-sm text-muted-foreground font-medium leading-snug">
                          {activeDayDetails.isPerfect
                            ? 'إنجاز استثنائي! تم إتمام جميع العادات المقررة بنجاح'
                            : activeDayDetails.completedCount > 0
                              ? `تم إنجاز ${activeDayDetails.completedCount} من أصل ${habitsCount} ${pluralize(habitsCount, HABIT_FORMS)} (${activeDayDetails.pct}%)`
                              : activeDayDetails.skipCount > 0
                                ? 'يوم تجميد لحفظ السلسلة والاستراحة'
                                : 'لم يتم تسجيل إنجازات في هذا اليوم حتى الآن'}
                        </p>
                      </div>
                    </div>

                    {/* Day Progress Capsule */}
                    <div className="flex items-center gap-2.5 shrink-0 @min-[560px]:w-36">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden border border-border/50">
                        <div
                          className={`h-full rounded-full transition-all duration-300 motion-reduce:transition-none ${
                            activeDayDetails.isPerfect ? 'bg-amber-400' : 'bg-primary'
                          }`}
                          style={{ width: `${activeDayDetails.pct}%` }}
                        />
                      </div>
                      <span className="text-xs @min-[560px]:text-sm font-black text-foreground tabular-nums shrink-0">
                        {activeDayDetails.pct}%
                      </span>
                    </div>
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            {/* Heatmap Legend Bar */}
            <div className="pt-3 @min-[440px]:pt-4 border-t border-border/40 flex items-center gap-3 text-xs text-muted-foreground font-medium">
              <div className="flex items-center gap-1.5 shrink-0">
                <Info className="w-3.5 h-3.5 text-primary/70 shrink-0" aria-hidden="true" />
                <span className="hidden @min-[560px]:inline whitespace-nowrap">
                  دليل وتيرة الإنجاز:
                </span>
              </div>

              <div className="flex items-center gap-3 @min-[440px]:gap-4 flex-1 min-w-0 overflow-x-auto pb-0.5 pe-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {/* 0% */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-3 h-3 @min-[440px]:w-3.5 @min-[440px]:h-3.5 rounded-md bg-muted/30 border border-border/60 shrink-0" />
                  <span className="text-[11px] whitespace-nowrap">لم يُنجز</span>
                </div>
                {/* 1 - 49% */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-3 h-3 @min-[440px]:w-3.5 @min-[440px]:h-3.5 rounded-md bg-primary/15 border border-primary/30 shrink-0" />
                  <span className="text-[11px] whitespace-nowrap">جزئي</span>
                </div>
                {/* 50 - 99% */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-3 h-3 @min-[440px]:w-3.5 @min-[440px]:h-3.5 rounded-md bg-primary/30 border border-primary/50 shrink-0" />
                  <span className="text-[11px] whitespace-nowrap">متقدم</span>
                </div>
                {/* 100% */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-3 h-3 @min-[440px]:w-3.5 @min-[440px]:h-3.5 rounded-md bg-linear-to-br from-primary/40 to-amber-500/30 border border-primary/60 shrink-0 flex items-center justify-center">
                    <Star className="w-2 h-2 text-amber-500 fill-amber-500" />
                  </span>
                  <span className="text-[11px] whitespace-nowrap">مكتمل 100%</span>
                </div>
                {/* Freeze */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-3 h-3 @min-[440px]:w-3.5 @min-[440px]:h-3.5 rounded-md bg-sky-500/20 border border-sky-500/40 shrink-0 flex items-center justify-center">
                    <Snowflake className="w-2 h-2 text-sky-500" />
                  </span>
                  <span className="text-[11px] whitespace-nowrap">تجميد</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
