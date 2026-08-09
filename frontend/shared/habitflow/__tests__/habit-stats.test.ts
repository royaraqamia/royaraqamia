import { describe, it, expect } from 'vitest';
import {
  calculateHabitStats,
  calculateAggregateStats,
  calculateTargetProgress,
  get30DayCalendarGrid,
} from '@/frontend/shared/habitflow/habit-stats';
import type { Habit, HabitLog } from '@/shared/contracts/habitflow';

const TODAY = '2026-08-02';

function makeLog(
  habitId: string,
  date: string,
  completed: boolean,
  kind?: HabitLog['kind']
): HabitLog {
  return {
    id: `l-${habitId}-${date}`,
    habitId,
    date,
    completed,
    completedAt: completed ? `${date}T08:00:00.000Z` : null,
    kind,
  };
}

function habit(id: string): Habit {
  return {
    id,
    name: `عادة ${id}`,
    icon: 'Activity',
    frequency: 'daily',
    createdAt: '2026-01-01T00:00:00.000Z',
    archived: false,
  };
}

describe('calculateHabitStats', () => {
  it('returns all zeros when there are no completed logs', () => {
    const logs = [makeLog('h-1', '2026-07-01', false)];
    expect(calculateHabitStats('h-1', logs, TODAY)).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      completionRate: 0,
      totalCompleted: 0,
    });
  });

  it('ignores logs belonging to other habits', () => {
    const logs = [makeLog('h-2', '2026-08-02', true)];
    expect(calculateHabitStats('h-1', logs, TODAY).totalCompleted).toBe(0);
  });

  it('computes a current streak for today and yesterday', () => {
    const logs = [makeLog('h-1', '2026-08-01', true), makeLog('h-1', '2026-08-02', true)];
    const stats = calculateHabitStats('h-1', logs, TODAY);
    expect(stats.currentStreak).toBe(2);
    expect(stats.longestStreak).toBe(2);
    expect(stats.totalCompleted).toBe(2);
  });

  it('keeps a streak when only yesterday was completed', () => {
    const logs = [makeLog('h-1', '2026-08-01', true)];
    expect(calculateHabitStats('h-1', logs, TODAY).currentStreak).toBe(1);
  });

  it('resets the current streak to 1 when today is completed but yesterday is not', () => {
    const logs = [
      makeLog('h-1', '2026-07-30', true),
      makeLog('h-1', '2026-07-31', true),
      makeLog('h-1', '2026-08-02', true),
    ];
    const stats = calculateHabitStats('h-1', logs, TODAY);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(2);
  });

  it('returns current streak 0 when neither today nor yesterday was completed', () => {
    const logs = [makeLog('h-1', '2026-07-30', true), makeLog('h-1', '2026-07-31', true)];
    expect(calculateHabitStats('h-1', logs, TODAY).currentStreak).toBe(0);
  });

  it('computes the longest streak across gaps', () => {
    const logs = [
      makeLog('h-1', '2026-07-01', true),
      makeLog('h-1', '2026-07-02', true),
      makeLog('h-1', '2026-07-03', true),
      makeLog('h-1', '2026-07-10', true),
      makeLog('h-1', '2026-07-11', true),
    ];
    expect(calculateHabitStats('h-1', logs, TODAY).longestStreak).toBe(3);
  });

  it('computes the completion rate over the last 30 days', () => {
    const logs: HabitLog[] = [];
    for (let i = 0; i < 15; i++) {
      const d = new Date(`${TODAY}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      logs.push(makeLog('h-1', d.toISOString().split('T')[0]!, true));
    }
    const stats = calculateHabitStats('h-1', logs, TODAY);
    expect(stats.completionRate).toBe(50);
    expect(stats.totalCompleted).toBe(15);
  });

  it('returns 100% completion when all 30 days are completed', () => {
    const logs: HabitLog[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(`${TODAY}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      logs.push(makeLog('h-1', d.toISOString().split('T')[0]!, true));
    }
    expect(calculateHabitStats('h-1', logs, TODAY).completionRate).toBe(100);
  });

  it('does not count completed logs older than 30 days in the rate', () => {
    const logs = [makeLog('h-1', '2026-06-01', true), makeLog('h-1', '2026-08-02', true)];
    const stats = calculateHabitStats('h-1', logs, TODAY);
    expect(stats.completionRate).toBe(3); // 1 of 30, rounded up
    expect(stats.totalCompleted).toBe(2);
  });

  it('freezes the streak when today is skipped', () => {
    // Completed yesterday, today skipped → streak is preserved (1 active day).
    const logs = [makeLog('h-1', '2026-08-01', true), makeLog('h-1', '2026-08-02', false, 'skip')];
    const stats = calculateHabitStats('h-1', logs, TODAY);
    expect(stats.currentStreak).toBe(1);
  });

  it('keeps the current streak alive through a skipped day', () => {
    // Mon + Tue done, Wed skipped, Thu done: the skip does not break the run.
    const logs = [
      makeLog('h-1', '2026-07-30', true),
      makeLog('h-1', '2026-07-31', true),
      makeLog('h-1', '2026-08-01', false, 'skip'),
      makeLog('h-1', '2026-08-02', true),
    ];
    const stats = calculateHabitStats('h-1', logs, TODAY);
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
  });

  it('does not count skipped days as completions', () => {
    const logs = [makeLog('h-1', '2026-07-30', true), makeLog('h-1', '2026-08-01', false, 'skip')];
    const stats = calculateHabitStats('h-1', logs, TODAY);
    expect(stats.totalCompleted).toBe(1);
    expect(stats.completionRate).toBe(3); // 1 of 30
  });

  it('breaks the streak when a day is explicitly missed', () => {
    // Completed and missing consecutive: miss breaks the chain.
    const logs = [
      makeLog('h-1', '2026-07-29', true),
      makeLog('h-1', '2026-07-30', true),
      makeLog('h-1', '2026-07-31', false, 'miss'),
      makeLog('h-1', '2026-08-01', true),
    ];
    const stats = calculateHabitStats('h-1', logs, TODAY);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(2);
  });

  it('a skipped yesterday freezes the streak even before today is logged', () => {
    // Yesterday skipped, today not logged: streak still counts the frozen run.
    const logs = [makeLog('h-1', '2026-07-31', true), makeLog('h-1', '2026-08-01', false, 'skip')];
    const stats = calculateHabitStats('h-1', logs, TODAY);
    expect(stats.currentStreak).toBe(1);
  });
});

describe('calculateAggregateStats', () => {
  it('returns zeros when there are no habits', () => {
    expect(calculateAggregateStats([], [], TODAY)).toEqual({
      averageCompletionRate: 0,
      highestStreak: 0,
      totalHabitsCompletedToday: 0,
      completedPercentageToday: 0,
    });
  });

  it('averages completion rates and counts habits completed today', () => {
    const habits = [habit('h-1'), habit('h-2')];
    const logs: HabitLog[] = [];
    // h-1: 30/30 = 100%; h-2: 0%
    for (let i = 0; i < 30; i++) {
      const d = new Date(`${TODAY}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      logs.push(makeLog('h-1', d.toISOString().split('T')[0]!, true));
    }

    const stats = calculateAggregateStats(habits, logs, TODAY);

    expect(stats.averageCompletionRate).toBe(50);
    expect(stats.totalHabitsCompletedToday).toBe(1);
    expect(stats.completedPercentageToday).toBe(50);
  });

  it('computes the highest current streak across habits', () => {
    const habits = [habit('h-1'), habit('h-2')];
    const logs = [
      makeLog('h-1', '2026-08-01', true),
      makeLog('h-1', '2026-08-02', true),
      makeLog('h-2', '2026-08-02', true),
    ];
    const stats = calculateAggregateStats(habits, logs, TODAY);
    expect(stats.highestStreak).toBe(2);
  });
});

describe('get30DayCalendarGrid', () => {
  it('returns exactly 30 days', () => {
    const grid = get30DayCalendarGrid('2026-08-02');
    expect(grid).toHaveLength(30);
  });

  it('marks today', () => {
    const grid = get30DayCalendarGrid('2026-08-02');
    const today = grid.find((g) => g.isToday);
    expect(today?.date).toBe('2026-08-02');
  });

  it('returns unique ascending dates with Arabic weekday labels', () => {
    const grid = get30DayCalendarGrid('2026-08-02');
    const dates = grid.map((g) => g.date);
    expect(new Set(dates).size).toBe(30);
    expect(dates[0]! < dates[29]!).toBe(true);
    for (const g of grid) {
      expect(g.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.dayLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('calculateTargetProgress', () => {
  const TODAY = '2026-08-02'; // Sunday; ISO week runs 2026-07-27 (Mon) to 2026-08-02.

  function targetedHabit(target: number, period: 'week' | 'month'): Habit {
    return {
      id: 'h-target',
      name: 'هدف',
      icon: 'Target',
      frequency: 'daily',
      createdAt: '2026-01-01T00:00:00.000Z',
      archived: false,
      target,
      targetPeriod: period,
    };
  }

  it('returns null when the habit has no target', () => {
    expect(calculateTargetProgress(habit('h-1'), [], TODAY)).toBeNull();
  });

  it('returns null when targetPeriod is missing or invalid', () => {
    const noPeriod: Habit = { ...targetedHabit(5, 'week'), targetPeriod: null };
    expect(calculateTargetProgress(noPeriod, [], TODAY)).toBeNull();
  });

  it('counts completions within the current ISO week', () => {
    const logs = [
      makeLog('h-target', '2026-07-27', true), // Monday (in week)
      makeLog('h-target', '2026-08-02', true), // Sunday (in week)
      makeLog('h-target', '2026-08-03', true), // Monday next week (out)
    ];
    const progress = calculateTargetProgress(targetedHabit(4, 'week'), logs, TODAY);
    expect(progress).toEqual({
      period: 'week',
      completed: 2,
      target: 4,
      percent: 50,
      periodStart: '2026-07-27',
      periodEnd: '2026-08-02',
    });
  });

  it('counts completions within the current calendar month', () => {
    const logs = [
      makeLog('h-target', '2026-08-01', true),
      makeLog('h-target', '2026-09-01', true), // next month (out)
      makeLog('h-target', '2026-07-31', true), // previous month (out)
    ];
    // Use a mid-month anchor so both the start and end of month are represented.
    const progress = calculateTargetProgress(targetedHabit(3, 'month'), logs, '2026-08-15');
    expect(progress).not.toBeNull();
    expect(progress!.completed).toBe(1);
    expect(progress!.percent).toBe(33);
    expect(progress!.periodStart).toBe('2026-08-01');
    expect(progress!.periodEnd).toBe('2026-08-31');
  });

  it('excludes skipped and missed logs from the target count', () => {
    const logs = [
      makeLog('h-target', '2026-07-27', true),
      makeLog('h-target', '2026-07-28', false, 'skip'),
      makeLog('h-target', '2026-07-29', false, 'miss'),
    ];
    const progress = calculateTargetProgress(targetedHabit(5, 'week'), logs, TODAY);
    expect(progress!.completed).toBe(1);
  });

  it('caps percent at 100 when the target is exceeded', () => {
    const logs = [
      makeLog('h-target', '2026-07-27', true),
      makeLog('h-target', '2026-07-28', true),
      makeLog('h-target', '2026-07-29', true),
    ];
    const progress = calculateTargetProgress(targetedHabit(2, 'week'), logs, TODAY);
    expect(progress!.completed).toBe(3);
    expect(progress!.percent).toBe(100);
  });
});
