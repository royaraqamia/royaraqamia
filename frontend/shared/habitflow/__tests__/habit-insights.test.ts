import { describe, it, expect } from 'vitest';
import {
  calculateInsights,
  isCelebrationStreak,
  CELEBRATION_MILESTONE,
} from '@/frontend/shared/habitflow/habit-insights';
import type { Habit, HabitLog } from '@/shared/contracts/habitflow';

const TODAY = '2026-08-02';

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

function makeLog(habitId: string, date: string, completedAt?: string | null): HabitLog {
  return {
    id: `l-${habitId}-${date}`,
    habitId,
    date,
    completed: true,
    completedAt: completedAt ?? `${date}T08:00:00.000Z`,
  };
}

describe('calculateInsights', () => {
  it('returns null when there are no habits', () => {
    expect(calculateInsights([], [], TODAY)).toBeNull();
  });

  it('reports the most frequent weekday and hour of completion', () => {
    // 2026-07-27 = Monday, 07-28 = Tuesday, 07-29 = Wednesday
    const logs = [
      makeLog('h-1', '2026-07-27', '2026-07-27T06:00:00.000Z'),
      makeLog('h-1', '2026-07-28', '2026-07-28T06:00:00.000Z'),
      makeLog('h-1', '2026-07-29', '2026-07-29T18:00:00.000Z'),
    ];
    const insights = calculateInsights([habit('h-1')], logs, TODAY);
    expect(insights?.bestDayOfWeek).toBe('الاثنين');
    expect(insights?.bestHour).toBe('6:00');
  });

  it('returns 100 recovery when there are no missed days', () => {
    const logs = [
      makeLog('h-1', '2026-07-31'),
      makeLog('h-1', '2026-08-01'),
      makeLog('h-1', TODAY),
    ];
    const insights = calculateInsights([habit('h-1')], logs, TODAY);
    expect(insights?.recoveryRate).toBe(100);
  });

  it('scores a recovered gap (missed day followed by completion)', () => {
    // Completed Mon, missed Tue, completed Wed: 1 miss, 1 recovered.
    const logs = [makeLog('h-1', '2026-07-27'), makeLog('h-1', '2026-07-29')];
    const insights = calculateInsights([habit('h-1')], logs, TODAY);
    expect(insights?.recoveryRate).toBe(100);
  });

  it('ignores the trailing gap after the last completion (not an interruption)', () => {
    // Completed Mon + Tue, then nothing until today — inside the completed span there were no misses.
    const logs = [makeLog('h-1', '2026-07-27'), makeLog('h-1', '2026-07-28')];
    const insights = calculateInsights([habit('h-1')], logs, TODAY);
    expect(insights?.recoveryRate).toBe(100);
  });

  it('counts completions today and the largest streaks', () => {
    // h-1 has a 2-day streak (08-01 + today); h-2 only completes today.
    const logs = [makeLog('h-1', '2026-08-01'), makeLog('h-1', TODAY), makeLog('h-2', TODAY)];
    const insights = calculateInsights([habit('h-1'), habit('h-2')], logs, TODAY);
    expect(insights?.completionsToday).toBe(2);
    expect(insights?.largestStreak).toBe(2);
    expect(insights?.activeHabits).toBe(2);
  });
});

describe('isCelebrationStreak', () => {
  it('flags streaks at or above the milestone', () => {
    expect(isCelebrationStreak(CELEBRATION_MILESTONE)).toBe(true);
    expect(isCelebrationStreak(CELEBRATION_MILESTONE + 1)).toBe(true);
    expect(isCelebrationStreak(CELEBRATION_MILESTONE - 1)).toBe(false);
  });
});
