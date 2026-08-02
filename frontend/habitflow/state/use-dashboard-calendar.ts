import { useState, type Dispatch, type SetStateAction } from 'react';
import { Habit, HabitLog, AggregateStats } from '@/shared/contracts/habitflow';
import { calculateAggregateStats, get30DayCalendarGrid } from '@/frontend/shared/habit-stats';
import { getTodayString } from './use-dashboard-data';

export interface DashboardCalendar {
  activeDate: string;
  setActiveDate: Dispatch<SetStateAction<string>>;
  activeStats: AggregateStats;
  calendarGrid: ReturnType<typeof get30DayCalendarGrid>;
  handleDateShift: (days: number) => void;
  getReadableActiveDate: () => string;
  todayDate: string;
}

export function useDashboardCalendar(habits: Habit[], logs: HabitLog[]): DashboardCalendar {
  const [activeDate, setActiveDate] = useState<string>(getTodayString);

  const activeStats: AggregateStats = calculateAggregateStats(habits, logs, activeDate);
  const calendarGrid = get30DayCalendarGrid(activeDate);

  const handleDateShift = (days: number) => {
    const current = new Date(activeDate);
    current.setDate(current.getDate() + days);
    setActiveDate(current.toISOString().split('T')[0]!);
  };

  const getReadableActiveDate = () => {
    const d = new Date(activeDate);
    return new Intl.DateTimeFormat('ar-SA', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      calendar: 'islamic-umalqura',
      numberingSystem: 'latn',
    }).format(d);
  };

  return {
    activeDate,
    setActiveDate,
    activeStats,
    calendarGrid,
    handleDateShift,
    getReadableActiveDate,
    todayDate: getTodayString(),
  };
}
