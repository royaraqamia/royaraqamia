import {
  Habit,
  HabitLog,
  IHabitRepository,
  HabitStats,
  AggregateStats,
} from '@/domains/habitflow/models';

export type { HabitStats, AggregateStats } from '@/domains/habitflow/models';

function getCompletedDateSet(habitId: string, logs: HabitLog[]): Set<string> {
  return new Set(logs.filter((l) => l.habitId === habitId && l.completed).map((l) => l.date));
}

function calcCurrentStreak(completedDates: Set<string>, todayStr: string): number {
  const today = new Date(`${todayStr}T00:00:00Z`);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const yesterdayStr = yesterday.toISOString().split('T')[0]!;
  const hasToday = completedDates.has(todayStr);
  const hasYesterday = completedDates.has(yesterdayStr);

  if (!hasToday && !hasYesterday) return 0;

  let checkDate = hasToday ? new Date(today) : new Date(yesterday);
  let streak = 0;

  while (true) {
    const checkStr = checkDate.toISOString().split('T')[0]!;
    if (completedDates.has(checkStr)) {
      streak++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function calcLongestStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;

  const ascending = [...completedDates].reverse();
  let longest = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const dStr of ascending) {
    const currentDate = new Date(`${dStr}T00:00:00Z`);
    if (prevDate === null) {
      tempStreak = 1;
    } else {
      const diffMs = Math.abs(currentDate.getTime() - prevDate.getTime());
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        if (tempStreak > longest) longest = tempStreak;
        tempStreak = 1;
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

export class HabitService {
  constructor(private repository: IHabitRepository) {}

  async getAllHabits(): Promise<Habit[]> {
    return this.repository.getHabits();
  }

  async createHabit(data: Partial<Habit>): Promise<Habit> {
    if (!data.name || data.name.trim() === '') {
      throw new Error('اسم العادة مطلوب');
    }
    return this.repository.createHabit({
      name: data.name.trim(),
      icon: data.icon || 'Activity',
      frequency: data.frequency || 'daily',
    });
  }

  async updateHabit(id: string, data: Partial<Habit>): Promise<Habit> {
    if (!id) throw new Error('معرّف العادة مطلوب');
    return this.repository.updateHabit(id, {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.frequency !== undefined && { frequency: data.frequency }),
      ...(data.archived !== undefined && { archived: data.archived }),
    });
  }

  async deleteHabit(id: string): Promise<boolean> {
    if (!id) throw new Error('معرّف العادة مطلوب');
    return this.repository.deleteHabit(id);
  }

  async toggleHabitLog(data: {
    habitId: string;
    date: string;
    completed: boolean;
  }): Promise<HabitLog> {
    if (!data.habitId || !data.date || data.completed === undefined) {
      throw new Error('حقول مطلوبة مفقودة للتسجيل');
    }
    return this.repository.toggleLog(data.habitId, data.date, data.completed);
  }

  async getLogs(startDate: string, endDate: string): Promise<HabitLog[]> {
    return this.repository.getLogs(startDate, endDate);
  }

  static calculateHabitStats(habitId: string, logs: HabitLog[], todayStr: string): HabitStats {
    const completedDates = getCompletedDateSet(habitId, logs);
    const completedArray = Array.from(completedDates).sort((a, b) => b.localeCompare(a));

    if (completedArray.length === 0) {
      return { currentStreak: 0, longestStreak: 0, completionRate: 0, totalCompleted: 0 };
    }

    return {
      currentStreak: calcCurrentStreak(completedDates, todayStr),
      longestStreak: calcLongestStreak(completedArray),
      completionRate: calcCompletionRate(completedDates, todayStr),
      totalCompleted: completedArray.length,
    };
  }

  static calculateAggregateStats(
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
      const stats = HabitService.calculateHabitStats(habit.id, logs, todayStr);
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

  static get30DayCalendarGrid(
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
        dayLabel: d.toLocaleDateString('ar-SA', { weekday: 'short' }),
        isToday: dStr === todayStr,
      });
    }

    return grid;
  }
}
