import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Habit, HabitLog, AggregateStats } from '@/shared/contracts/habitflow';
import {
  calculateAggregateStats,
  get30DayCalendarGrid,
} from '@/frontend/shared/habitflow/habit-stats';
import { damascusDateKey } from '@/shared/time';
import { replaceSearch } from '@/frontend/shared/replace-search';
import {
  habitflowDateFromSearch,
  searchWithHabitflowDate,
} from '@/frontend/state/habitflow/habitflow-date-url';

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
  // Today is resolved once per mount: a tick past midnight must not rewrite the
  // day the member chose to be looking at.
  const [todayDate] = useState(damascusDateKey);
  const [activeDate, setActiveDate] = useState<string>(todayDate);
  // The URL is read after mount, not during render: the document is prerendered
  // for every visitor, so the server cannot know the member's day (ADR-0031).
  const [readFromUrl, setReadFromUrl] = useState(false);

  useEffect(() => {
    const fromUrl = habitflowDateFromSearch(window.location.search);
    if (fromUrl) setActiveDate(fromUrl);
    setReadFromUrl(true);
  }, []);

  // A day is a view, not a second screen (ADR-0147): replace the entry instead
  // of pushing one, so Back leaves the page rather than walking through days.
  useEffect(() => {
    if (!readFromUrl) return;
    replaceSearch(searchWithHabitflowDate(window.location.search, activeDate, todayDate));
  }, [activeDate, readFromUrl, todayDate]);

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
    todayDate,
  };
}
