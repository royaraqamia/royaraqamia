import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { useDashboardToggle } from '@/frontend/state/habitflow/use-dashboard-toggle';
import type { HabitLog } from '@/shared/contracts/habitflow';

const mocks = vi.hoisted(() => ({
  toggleLog: vi.fn(),
  setLogKind: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/frontend/api/habitflow/habit-api', () => ({
  ApiClient: {
    toggleLog: mocks.toggleLog,
    setLogKind: mocks.setLogKind,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

const ACTIVE_DATE = '2026-08-18';

function Harness({ user, initialLogs }: { user: unknown; initialLogs: HabitLog[] }) {
  const [logs, setLogs] = useState(initialLogs);
  const toggle = useDashboardToggle(user, logs, setLogs, ACTIVE_DATE);
  return (
    <div>
      <span data-testid="logs">{JSON.stringify(logs)}</span>
      <button onClick={() => toggle.handleToggleLog('h-1')}>toggle</button>
      <button onClick={() => toggle.handleSkipHabit('h-1')}>skip</button>
    </div>
  );
}

function readLogs(): HabitLog[] {
  return JSON.parse(screen.getByTestId('logs').textContent ?? '[]') as HabitLog[];
}

const serverLog: HabitLog = {
  id: 'log-server',
  habitId: 'h-1',
  date: ACTIVE_DATE,
  completed: true,
  completedAt: '2026-08-18T08:00:00.000Z',
  kind: 'complete',
};

describe('useDashboardToggle (optimistic toggle + rollback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies the toggle optimistically before the API resolves, then swaps in the server log', async () => {
    let resolveToggle: ((value: { log: HabitLog }) => void) | undefined;
    mocks.toggleLog.mockImplementation(
      () =>
        new Promise<{ log: HabitLog }>((resolve) => {
          resolveToggle = resolve;
        })
    );

    render(<Harness user={{ id: 'u-1' }} initialLogs={[]} />);

    fireEvent.click(screen.getByText('toggle'));

    await waitFor(() => expect(readLogs()).toHaveLength(1));
    const optimistic = readLogs();
    expect(optimistic[0]!.habitId).toBe('h-1');
    expect(optimistic[0]!.completed).toBe(true);
    expect(mocks.toggleLog).toHaveBeenCalledWith('h-1', ACTIVE_DATE, true);

    await act(async () => {
      resolveToggle?.({ log: serverLog });
    });

    await waitFor(() => expect(readLogs()).toHaveLength(1));
    const settled = readLogs();
    expect(settled[0]!.id).toBe('log-server');
  });

  it('rolls back to the exact previous logs when the API fails (no ghost temp entry)', async () => {
    mocks.toggleLog.mockRejectedValue(new Error('boom'));

    const initial: HabitLog[] = [
      {
        id: 'log-existing',
        habitId: 'h-1',
        date: ACTIVE_DATE,
        completed: false,
        completedAt: null,
      },
    ];
    render(<Harness user={{ id: 'u-1' }} initialLogs={initial} />);

    fireEvent.click(screen.getByText('toggle'));

    await waitFor(() => {
      expect(readLogs()).toEqual(initial);
    });
    expect(readLogs().every((l) => !l.id.startsWith('temp-'))).toBe(true);
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('حدث خطأ'));
  });

  it('rolls back a failed skip and leaves logs untouched', async () => {
    mocks.setLogKind.mockRejectedValue(new Error('boom'));

    const initial: HabitLog[] = [
      {
        id: 'log-existing',
        habitId: 'h-1',
        date: ACTIVE_DATE,
        completed: true,
        completedAt: '2026-08-18T07:00:00.000Z',
        kind: 'complete',
      },
    ];
    render(<Harness user={{ id: 'u-1' }} initialLogs={initial} />);

    fireEvent.click(screen.getByText('skip'));

    await waitFor(() => {
      expect(readLogs()).toEqual(initial);
    });
    expect(mocks.setLogKind).toHaveBeenCalledWith('h-1', ACTIVE_DATE, 'skip');
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('حدث خطأ'));
  });

  it('applies a skip optimistically then settles with the server log', async () => {
    let resolveKind: ((value: { log: HabitLog }) => void) | undefined;
    mocks.setLogKind.mockImplementation(
      () =>
        new Promise<{ log: HabitLog }>((resolve) => {
          resolveKind = resolve;
        })
    );

    render(<Harness user={{ id: 'u-1' }} initialLogs={[]} />);

    fireEvent.click(screen.getByText('skip'));

    await waitFor(() => expect(readLogs()).toHaveLength(1));
    expect(readLogs()[0]!.kind).toBe('skip');

    const skipLog: HabitLog = {
      id: 'log-skip',
      habitId: 'h-1',
      date: ACTIVE_DATE,
      completed: false,
      completedAt: null,
      kind: 'skip',
    };
    await act(async () => {
      resolveKind?.({ log: skipLog });
    });

    await waitFor(() => expect(readLogs()[0]!.id).toBe('log-skip'));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining('سلسلتك محفوظة'));
  });
});
