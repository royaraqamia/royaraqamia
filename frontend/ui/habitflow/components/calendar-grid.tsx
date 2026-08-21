'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';
import { HabitLog } from '@/shared/contracts/habitflow';
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
  TrendingUp,
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
      className={`relative w-full max-w-4xl mx-auto space-y-6 sm:space-y-8 font-sans antialiased text-foreground selection:bg-primary/20 selection:text-primary ${className}`}
    >
      {/* Dynamic Ambient Background Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-full max-w-2xl h-56 bg-linear-to-r from-primary/20 via-primary/10 to-transparent blur-3xl opacity-70 rounded-full dark:opacity-40"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 right-10 w-64 h-64 bg-primary/10 blur-3xl rounded-full opacity-50"
      />

      {/* Header Section */}
      <header className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/40">
        <div className="flex items-center gap-3.5 sm:gap-4">
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-linear-to-br from-primary/25 via-primary/10 to-background border border-primary/30 text-primary shadow-sm ring-1 ring-primary/20 shrink-0">
            <CalendarDays className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden="true" />
            <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-xs" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                سلسلة الإنجاز
              </h2>
              {stats.perfectDays > 0 && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-2xs">
                  <Flame className="w-3 h-3 text-amber-500 fill-amber-500 animate-pulse motion-reduce:animate-none" />
                  <span>
                    {stats.perfectDays} {pluralize(stats.perfectDays, PERFECT_DAY_FORMS)}
                  </span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">
              تتبّع وتيرة التزامك اليومي وحافظ على استمراريّة عاداتك
            </p>
          </div>
        </div>

        {/* Header Right Actions & Badges */}
        <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0 flex-wrap">
          {todayItem && activeDate !== todayItem.date && (
            <button
              type="button"
              onClick={() => onDateSelect(todayItem.date)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 border border-border/50 backdrop-blur-md transition-all duration-200 active:scale-95 cursor-pointer motion-reduce:transform-none motion-reduce:transition-none"
              title="الانتقال إلى تاريخ اليوم"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-primary" />
              <span>اليوم</span>
            </button>
          )}

          {habitsCount > 0 && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-linear-to-r from-primary/15 via-primary/10 to-primary/5 text-primary border border-primary/30 shadow-xs backdrop-blur-md">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
          {/* Rate Card */}
          <div className="relative overflow-hidden p-3 sm:p-3.5 rounded-2xl bg-card/40 border border-border/40 backdrop-blur-xl shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-medium text-muted-foreground truncate">
                معدل الإنجاز
              </span>
              <span className="text-base sm:text-lg font-black tracking-tight text-foreground tabular-nums">
                {stats.completionRate}%
              </span>
            </div>
          </div>

          {/* Perfect Days Card */}
          <div className="relative overflow-hidden p-3 sm:p-3.5 rounded-2xl bg-card/40 border border-border/40 backdrop-blur-xl shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-medium text-muted-foreground truncate">
                أيام مكتملة 100%
              </span>
              <span className="text-base sm:text-lg font-black tracking-tight text-foreground tabular-nums">
                {stats.perfectDays}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {pluralize(stats.perfectDays, DAY_FORMS)}
                </span>
              </span>
            </div>
          </div>

          {/* Completed Habits Count */}
          <div className="relative overflow-hidden p-3 sm:p-3.5 rounded-2xl bg-card/40 border border-border/40 backdrop-blur-xl shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-medium text-muted-foreground truncate">
                العادات المنجزة
              </span>
              <span className="text-base sm:text-lg font-black tracking-tight text-foreground tabular-nums">
                {stats.totalCompleted}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {pluralize(stats.totalCompleted, TIME_FORMS)}
                </span>
              </span>
            </div>
          </div>

          {/* Freeze Protection Days */}
          <div className="relative overflow-hidden p-3 sm:p-3.5 rounded-2xl bg-card/40 border border-border/40 backdrop-blur-xl shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 shrink-0">
              <Snowflake className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-medium text-muted-foreground truncate">
                أيام التجميد
              </span>
              <span className="text-base sm:text-lg font-black tracking-tight text-foreground tabular-nums">
                {stats.freezeDays}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {pluralize(stats.freezeDays, DAY_FORMS)}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Glassmorphic Container Card */}
      <Card className="relative overflow-hidden p-3.5 sm:p-6 md:p-8 rounded-3xl sm:rounded-4xl border border-border/50 bg-card/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] transition-all duration-300 motion-reduce:transition-none">
        {habitsCount === 0 ? (
          /* High-End Empty State */
          <div className="relative overflow-hidden py-14 sm:py-20 px-6 text-center space-y-6 flex flex-col items-center justify-center bg-linear-to-b from-muted/20 via-muted/5 to-transparent rounded-2xl sm:rounded-3xl border-2 border-dashed border-border/60">
            <div className="relative flex items-center justify-center">
              <div className="absolute -inset-4 rounded-full bg-primary/20 blur-2xl animate-pulse motion-reduce:animate-none" />
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-linear-to-br from-primary/20 via-primary/10 to-background border border-primary/30 flex items-center justify-center text-primary shadow-lg ring-1 ring-primary/20">
                <CalendarDays className="w-10 h-10 sm:w-12 sm:h-12 opacity-90" aria-hidden="true" />
              </div>
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5">
                <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-primary border-2 border-background shadow-xs"></span>
              </span>
            </div>

            <div className="space-y-2.5 max-w-md mx-auto">
              <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                لا توجد عادات نشطة بعد
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                أضِف عاداتك اليومية لتبدأ في بناء سلسلة الاستمرارية وتتبّع نموّك خطوة بخطوة في هذا
                التقويم
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {/* Calendar Grid Cells */}
            <div
              ref={gridContainerRef}
              role="grid"
              aria-label="شبكة أيام الإنجاز"
              className="space-y-2 sm:space-y-3.5"
            >
              {gridRows.map((row, rowIndex) => (
                <div
                  key={`row-${rowIndex}`}
                  role="row"
                  className="grid grid-cols-5 gap-2 sm:gap-3.5 md:gap-4 lg:gap-4.5"
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
                        'bg-linear-to-br from-primary/35 via-primary/20 to-amber-500/15 hover:from-primary/45 hover:via-primary/30 hover:to-amber-500/25 border-primary/50 text-foreground font-semibold shadow-md shadow-primary/10';
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
                        'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/25 z-20 scale-[1.02] sm:scale-[1.03]';
                    } else if (isToday) {
                      glowRing = 'ring-2 ring-primary/80 ring-offset-2 ring-offset-background z-10';
                    }

                    return (
                      <div
                        key={gridItem.date}
                        role="gridcell"
                        aria-selected={isSelected}
                        className="relative aspect-square rounded-2xl sm:rounded-3xl"
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
                            relative group w-full h-full rounded-2xl sm:rounded-3xl flex flex-col items-center justify-between
                            p-2 sm:p-3 md:p-3.5 text-center cursor-pointer select-none outline-none border
                            focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
                            touch-manipulation overflow-hidden
                            transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0
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

                          {/* Top Row: Weekday Label & Indicators */}
                          <div className="w-full relative flex items-center justify-between z-10">
                            <span className="text-[10px] sm:text-xs font-bold tracking-tight opacity-80 group-hover:opacity-100 transition-opacity truncate">
                              {gridItem.dayLabel}
                            </span>

                            <div className="flex items-center gap-1 shrink-0">
                              {isPerfectDay && (
                                <Star
                                  className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                              {isToday && (
                                <span
                                  className="relative flex h-2 w-2"
                                  aria-hidden="true"
                                  title="اليوم"
                                >
                                  <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-primary opacity-85" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary shadow-xs" />
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Middle: Day Number */}
                          <div className="relative my-auto flex flex-col items-center justify-center z-10">
                            <span className="text-base sm:text-2xl md:text-3xl font-black tracking-tight leading-none tabular-nums text-foreground">
                              {dayNum}
                            </span>
                          </div>

                          {/* Bottom: Progress Badge / Mini Track */}
                          <div className="w-full relative z-10 flex flex-col items-center gap-1">
                            {/* Interactive Badge */}
                            <div className="h-4 sm:h-5 flex items-center justify-center gap-1 w-full">
                              {completedCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[11px] font-black px-1.5 py-0.5 rounded-full bg-background/90 text-foreground border border-border/60 backdrop-blur-md shadow-2xs">
                                  <CheckCircle2
                                    className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="tabular-nums">
                                    {completedCount}
                                    <span className="hidden sm:inline opacity-60 font-normal">
                                      /{habitsCount}
                                    </span>
                                  </span>
                                </span>
                              )}

                              {isFrozenDay && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30 backdrop-blur-md shadow-2xs">
                                  <Snowflake className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-sky-500 shrink-0" />
                                  <span className="hidden sm:inline">مجمد</span>
                                </span>
                              )}

                              {completedCount === 0 && !isFrozenDay && (
                                <span
                                  aria-hidden="true"
                                  className="text-[10px] opacity-0 group-hover:opacity-40 transition-opacity font-medium"
                                >
                                  -
                                </span>
                              )}
                            </div>

                            {/* Mini Subtle Progress Bar */}
                            {habitsCount > 0 && (
                              <div
                                aria-hidden="true"
                                className="w-full h-1 bg-foreground/5 rounded-full overflow-hidden"
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
                          </div>
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
                  className="relative overflow-hidden p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-linear-to-r from-muted/30 via-muted/15 to-transparent border border-border/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      {activeDayDetails.isPerfect ? (
                        <Trophy className="w-5 h-5 text-amber-500" />
                      ) : activeDayDetails.completedCount > 0 ? (
                        <CalendarIcon className="w-5 h-5" />
                      ) : activeDayDetails.skipCount > 0 ? (
                        <Snowflake className="w-5 h-5 text-sky-500" />
                      ) : (
                        <CalendarIcon className="w-5 h-5" />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm sm:text-base font-black text-foreground">
                          {activeDayDetails.formattedDate}
                        </h4>
                        {activeDayDetails.isToday && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary/20 text-primary border border-primary/30">
                            اليوم
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">
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

                  {/* Right Progress Capsule */}
                  <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <span className="text-xs font-bold text-muted-foreground block">
                        نسبة اليوم
                      </span>
                      <span className="text-base font-black text-foreground tabular-nums">
                        {activeDayDetails.pct}%
                      </span>
                    </div>
                    <div className="w-24 sm:w-28 h-2 bg-muted rounded-full overflow-hidden border border-border/50">
                      <div
                        className={`h-full rounded-full transition-all duration-300 motion-reduce:transition-none ${
                          activeDayDetails.isPerfect ? 'bg-amber-400' : 'bg-primary'
                        }`}
                        style={{ width: `${activeDayDetails.pct}%` }}
                      />
                    </div>
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            {/* Heatmap Legend Bar */}
            <div className="pt-4 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground font-medium">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary/70 shrink-0" aria-hidden="true" />
                <span>دليل وتيرة الإنجاز:</span>
              </div>

              <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap justify-center">
                {/* 0% */}
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-muted/30 border border-border/60 shrink-0" />
                  <span className="text-[11px]">لم يُنجز</span>
                </div>
                {/* 1 - 49% */}
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-primary/15 border border-primary/30 shrink-0" />
                  <span className="text-[11px]">جزئي</span>
                </div>
                {/* 50 - 99% */}
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-primary/30 border border-primary/50 shrink-0" />
                  <span className="text-[11px]">متقدم</span>
                </div>
                {/* 100% */}
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-linear-to-br from-primary/40 to-amber-500/30 border border-primary/60 shrink-0 flex items-center justify-center">
                    <Star className="w-2 h-2 text-amber-500 fill-amber-500" />
                  </span>
                  <span className="text-[11px]">مكتمل 100%</span>
                </div>
                {/* Freeze */}
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-sky-500/20 border border-sky-500/40 shrink-0 flex items-center justify-center">
                    <Snowflake className="w-2 h-2 text-sky-500" />
                  </span>
                  <span className="text-[11px]">تجميد</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
