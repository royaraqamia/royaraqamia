import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { calculateHabitStats } from '@/frontend/shared/habitflow/habit-stats';

export interface HabitInsights {
  bestDayOfWeek: string | null;
  bestHour: string | null;
  recoveryRate: number;
  activeHabits: number;
  completionsToday: number;
  largestStreak: number;
  largestCurrentStreak: number;
}

export const CELEBRATION_MILESTONE = 7;

const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function mostFrequent(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function recoveryRateFor(completedDates: Set<string>): number {
  if (completedDates.size === 0) return 100;
  const sortedAsc = Array.from(completedDates).sort();
  const earliest = sortedAsc[0]!;
  const latest = sortedAsc[sortedAsc.length - 1]!;
  if (earliest === latest) return 100;

  const cursor = new Date(`${earliest}T00:00:00Z`);
  const end = new Date(`${latest}T00:00:00Z`);

  let misses = 0;
  let recovered = 0;

  while (cursor < end) {
    const curStr = cursor.toISOString().slice(0, 10);
    if (completedDates.has(curStr)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 1);
    misses++;
    if (completedDates.has(next.toISOString().slice(0, 10))) {
      recovered++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (misses === 0) return 100;
  return Math.round((recovered / misses) * 100);
}

export function isCelebrationStreak(currentStreak: number): boolean {
  return currentStreak >= CELEBRATION_MILESTONE;
}

export function calculateInsights(
  habits: Habit[],
  logs: HabitLog[],
  todayStr: string
): HabitInsights | null {
  if (habits.length === 0) return null;

  const habitIds = new Set(habits.map((h) => h.id));
  const relevantLogs = logs.filter((l) => habitIds.has(l.habitId));

  const weekdayValues: number[] = [];
  const hourValues: number[] = [];

  for (const log of relevantLogs) {
    if (!log.completed) continue;
    weekdayValues.push(new Date(`${log.date}T00:00:00Z`).getUTCDay());
    if (log.completedAt) {
      hourValues.push(new Date(log.completedAt).getUTCHours());
    }
  }

  const bestWeekday = mostFrequent(weekdayValues);
  const bestHour = mostFrequent(hourValues);

  const recoveryRows: number[] = [];
  let largestStreak = 0;
  let largestCurrentStreak = 0;

  for (const habit of habits) {
    const stats = calculateHabitStats(habit.id, logs, todayStr);
    const habitDates = new Set(
      relevantLogs.filter((l) => l.habitId === habit.id && l.completed).map((l) => l.date)
    );
    if (stats.totalCompleted > 0) {
      recoveryRows.push(recoveryRateFor(habitDates));
    }
    if (stats.longestStreak > largestStreak) largestStreak = stats.longestStreak;
    if (stats.currentStreak > largestCurrentStreak) largestCurrentStreak = stats.currentStreak;
  }

  const recoveryRate =
    recoveryRows.length === 0
      ? 100
      : Math.round(recoveryRows.reduce((a, b) => a + b, 0) / recoveryRows.length);

  const completionsToday = relevantLogs.filter((l) => l.date === todayStr && l.completed).length;

  return {
    bestDayOfWeek: bestWeekday === null ? null : (WEEKDAYS_AR[bestWeekday] ?? null),
    bestHour: bestHour === null ? null : `${bestHour}:00`,
    recoveryRate,
    activeHabits: habits.length,
    completionsToday,
    largestStreak,
    largestCurrentStreak,
  };
}
