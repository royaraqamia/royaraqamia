import { Habit, HabitLog, HabitStats, AggregateStats } from '@/shared/contracts/habitflow';

function getCompletedDateSet(habitId: string, logs: HabitLog[]): Set<string> {
  return new Set(logs.filter((l) => l.habitId === habitId && l.completed).map((l) => l.date));
}

function getSkippedDateSet(habitId: string, logs: HabitLog[]): Set<string> {
  return new Set(logs.filter((l) => l.habitId === habitId && l.kind === 'skip').map((l) => l.date));
}

function countActiveStreak(
  activeDates: Set<string>,
  completedDates: Set<string>,
  anchorDate: string
): number {
  let count = 0;
  let checkDate = new Date(`${anchorDate}T00:00:00Z`);

  while (true) {
    const checkStr = checkDate.toISOString().split('T')[0]!;
    if (activeDates.has(checkStr)) {
      if (completedDates.has(checkStr)) {
        count++;
      }
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return count;
}

function calcCurrentStreak(
  completedDates: Set<string>,
  skippedDates: Set<string>,
  todayStr: string
): number {
  const activeDates = new Set([...completedDates, ...skippedDates]);
  const today = new Date(`${todayStr}T00:00:00Z`);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const yesterdayStr = yesterday.toISOString().split('T')[0]!;

  let anchor: string | null = null;
  if (activeDates.has(todayStr)) {
    anchor = todayStr;
  } else if (activeDates.has(yesterdayStr)) {
    anchor = yesterdayStr;
  }

  if (anchor === null) return 0;

  return countActiveStreak(activeDates, completedDates, anchor);
}

function calcLongestStreak(completedDates: Set<string>, skippedDates: Set<string>): number {
  const activeDates = Array.from(new Set([...completedDates, ...skippedDates])).sort();

  if (activeDates.length === 0) return 0;

  let longest = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const dStr of activeDates) {
    const currentDate = new Date(`${dStr}T00:00:00Z`);
    if (prevDate === null) {
      tempStreak = completedDates.has(dStr) ? 1 : 0;
    } else {
      const diffMs = Math.abs(currentDate.getTime() - prevDate.getTime());
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        if (completedDates.has(dStr)) {
          tempStreak++;
        }
      } else {
        if (tempStreak > longest) longest = tempStreak;
        tempStreak = completedDates.has(dStr) ? 1 : 0;
      }
    }
    prevDate = currentDate;
  }
  if (tempStreak > longest) longest = tempStreak;

  return longest;
}

function calcCompletionRate(completedDates: Set<string>, todayStr: string): number {
  const today = new Date(`${todayStr}T00:00:00Z`);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);

  let count = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setUTCDate(d.getUTCDate() + i);
    if (completedDates.has(d.toISOString().split('T')[0]!)) {
      count++;
    }
  }

  return Math.round((count / 30) * 100);
}

export function calculateHabitStats(
  habitId: string,
  logs: HabitLog[],
  todayStr: string
): HabitStats {
  const completedDates = getCompletedDateSet(habitId, logs);
  const skippedDates = getSkippedDateSet(habitId, logs);
  const completedArray = Array.from(completedDates).sort((a, b) => b.localeCompare(a));

  if (completedArray.length === 0) {
    return { currentStreak: 0, longestStreak: 0, completionRate: 0, totalCompleted: 0 };
  }

  return {
    currentStreak: calcCurrentStreak(completedDates, skippedDates, todayStr),
    longestStreak: calcLongestStreak(completedDates, skippedDates),
    completionRate: calcCompletionRate(completedDates, todayStr),
    totalCompleted: completedArray.length,
  };
}

export function calculateAggregateStats(
  habits: Habit[],
  logs: HabitLog[],
  todayStr: string
): AggregateStats {
  if (habits.length === 0) {
    return {
      averageCompletionRate: 0,
      highestStreak: 0,
      totalHabitsCompletedToday: 0,
      completedPercentageToday: 0,
    };
  }

  let totalCompletionRateSum = 0;
  let highestStreak = 0;
  let totalHabitsCompletedToday = 0;

  for (const habit of habits) {
    const stats = calculateHabitStats(habit.id, logs, todayStr);
    totalCompletionRateSum += stats.completionRate;
    if (stats.currentStreak > highestStreak) {
      highestStreak = stats.currentStreak;
    }
    if (logs.some((l) => l.habitId === habit.id && l.date === todayStr && l.completed)) {
      totalHabitsCompletedToday++;
    }
  }

  return {
    averageCompletionRate: Math.round(totalCompletionRateSum / habits.length),
    highestStreak,
    totalHabitsCompletedToday,
    completedPercentageToday: Math.round((totalHabitsCompletedToday / habits.length) * 100),
  };
}

export function get30DayCalendarGrid(
  todayStr: string
): { date: string; dayLabel: string; isToday: boolean }[] {
  const grid: { date: string; dayLabel: string; isToday: boolean }[] = [];
  const today = new Date(todayStr);

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().split('T')[0]!;
    grid.push({
      date: dStr,
      dayLabel: d.toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'short' }),
      isToday: dStr === todayStr,
    });
  }

  return grid;
}
