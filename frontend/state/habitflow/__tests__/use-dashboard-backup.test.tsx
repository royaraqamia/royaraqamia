import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Habit, HabitLog, HabitRepository } from '@/shared/contracts/habitflow';
import { useDashboardBackup } from '@/frontend/state/habitflow/use-dashboard-backup';

const habitFixture: Habit = {
  id: 'h-1',
  name: 'قراءة',
  frequency: 'daily',
  createdAt: '2026-01-01T00:00:00.000Z',
  archived: false,
};

const logFixture: HabitLog = {
  id: 'l-1',
  habitId: 'h-1',
  date: '2026-10-31',
  completed: true,
  completedAt: '2026-10-30T21:20:00.000Z',
};

function makeRepository(logs: HabitLog[]): HabitRepository {
  return {
    getHabits: vi.fn().mockResolvedValue([habitFixture]),
    findHabitByClientId: vi.fn().mockResolvedValue(null),
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    deleteHabit: vi.fn(),
    getLogs: vi.fn().mockResolvedValue(logs),
    toggleLog: vi.fn(),
    setLogKind: vi.fn(),
    setLogNote: vi.fn(),
    restoreFromBackup: vi.fn().mockResolvedValue(undefined),
    getLocalData: vi.fn().mockResolvedValue({ habits: [], logs: [] }),
    getSyncData: vi.fn().mockResolvedValue({ habits: [], logs: [] }),
  };
}

let downloads: { filename: string; blob: Blob }[] = [];

/** jsdom has no object URLs, so the blob a download carries is captured instead. */
function captureDownloads(): void {
  downloads = [];
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn((blob: Blob) => {
      downloads.push({ filename: '', blob });
      return `blob:habitflow/${downloads.length - 1}`;
    }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    const index = Number(this.href.split('/').pop());
    const captured = downloads[index];
    if (captured) captured.filename = this.download;
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * #683: the export window and the filename are the calendar day the dashboard
 * counts in — the Damascus day (ADR-0093). At 00:30 in Damascus the UTC date is
 * still the previous day, so a UTC window and a UTC filename were both a day off.
 */
describe('useDashboardBackup (local day, not the UTC day)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 00:30 in Damascus on 31 October, still 30 October in UTC.
    vi.setSystemTime(new Date('2026-10-30T21:30:00Z'));
    captureDownloads();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('includes a log dated with the local day in the JSON backup', async () => {
    const repository = makeRepository([logFixture]);
    const { result } = renderHook(() => useDashboardBackup(repository, vi.fn()));
    await flush();

    await act(async () => {
      await result.current.handleDownloadBackup();
    });

    expect(repository.getLogs).toHaveBeenCalledWith('2020-01-01', '2026-10-31');
    const [download] = downloads;
    expect(download?.filename).toBe('habitflow_backup_2026-10-31.json');
    expect(JSON.parse((await download!.blob.text()) as string).logs).toEqual([logFixture]);
  });

  it('includes a log dated with the local day in the CSV, and names it the same day', async () => {
    const repository = makeRepository([logFixture]);
    const { result } = renderHook(() => useDashboardBackup(repository, vi.fn()));
    await flush();

    await act(async () => {
      await result.current.handleDownloadCsv();
    });

    expect(repository.getLogs).toHaveBeenCalledWith('2020-01-01', '2026-10-31');
    const [download] = downloads;
    expect(download?.filename).toBe('habitflow_export_2026-10-31.csv');
    expect(await download!.blob.text()).toContain('h-1,2026-10-31,true');
  });
});
