import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  HABITFLOW_SNAPSHOT_ROUTE,
  useDashboardData,
  type DashboardSeed,
} from '@/frontend/state/habitflow/use-dashboard-data';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import {
  GUEST_IDENTITY,
  userIdentity,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import type { Habit } from '@/shared/contracts/habitflow';
import {
  clearSnapshots,
  readSnapshot,
  writeSnapshot,
} from '@/frontend/shared/local-store/snapshot';

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h-1',
    name: 'قراءة',
    frequency: 'daily',
    createdAt: '2026-01-01T00:00:00.000Z',
    archived: false,
    ...overrides,
  };
}

function Harness({ seed }: { seed: DashboardSeed }) {
  const { habits } = useDashboardData(seed);
  return <span data-testid="habits">{habits.map((habit) => habit.name).join('|')}</span>;
}

async function seedStore(identity: LocalIdentity, name: string) {
  const store = await HabitLocalStore.open(identity);
  await store.createHabit({ name, frequency: 'daily' });
  store.close();
}

describe('useDashboardData (Local Store is the source of truth)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    window.localStorage.clear();
    clearSnapshots();
  });

  it('renders the stored habits, not the stale SSR seed', async () => {
    await seedStore(GUEST_IDENTITY, 'من المتجر');

    render(
      <Harness
        seed={{
          habits: [makeHabit({ id: 'server', name: 'من الخادم' })],
          logs: [],
          mode: 'local',
          user: null,
        }}
      />
    );

    await waitFor(() => expect(screen.getByTestId('habits').textContent).toBe('من المتجر'));
  });

  it('seeds an empty store from the server loader on first open', async () => {
    render(
      <Harness
        seed={{
          habits: [makeHabit({ id: 'server', name: 'من الخادم' })],
          logs: [],
          mode: 'local',
          user: null,
        }}
      />
    );

    await waitFor(() => expect(screen.getByTestId('habits').textContent).toBe('من الخادم'));
  });

  it('claims guest rows into the account namespace on sign-in', async () => {
    await seedStore(GUEST_IDENTITY, 'بيانات الضيوف');
    await seedStore(userIdentity('u-1'), 'بيانات المستخدم');

    render(
      <Harness
        seed={{
          habits: [],
          logs: [],
          mode: 'supabase',
          user: { id: 'u-1' },
        }}
      />
    );

    // The account store is the only one read; the guest work is absorbed into
    // it (ADR-0027) rather than shown as a separate namespace.
    await waitFor(() => {
      const text = screen.getByTestId('habits').textContent ?? '';
      expect(text).toContain('بيانات الضيوف');
      expect(text).toContain('بيانات المستخدم');
    });

    const guest = await HabitLocalStore.open(GUEST_IDENTITY);
    expect(await guest.getHabits()).toHaveLength(0);
    guest.close();
  });

  /**
   * #495: the store's read is a promise, so before it answers the first frame is
   * the screen this list last painted. Without this the rows arrive one frame
   * after a cold navigation, which is what the owner feels as lag.
   */
  it('paints the last recorded screen before the store answers', async () => {
    writeSnapshot(GUEST_IDENTITY, HABITFLOW_SNAPSHOT_ROUTE, {
      habits: [makeHabit({ id: 'snap', name: 'من اللقطة' })],
      logs: [],
    });

    // The store is empty, so anything on screen here came from the snapshot.
    render(<Harness seed={{ habits: [], logs: [], mode: 'local', user: null }} />);

    // No `waitFor`: measured on the first client commit, before IndexedDB.
    expect(screen.getByTestId('habits').textContent).toBe('من اللقطة');

    // …and it is replaced wholesale by the store's answer, not appended to.
    await waitFor(() => expect(screen.getByTestId('habits').textContent).toBe(''));
  });

  it('records the screen the list painted', async () => {
    await seedStore(GUEST_IDENTITY, 'من المتجر');

    render(<Harness seed={{ habits: [], logs: [], mode: 'local', user: null }} />);

    await waitFor(() => expect(screen.getByTestId('habits').textContent).toBe('من المتجر'));
    await waitFor(() =>
      expect(
        readSnapshot<{ habits: Habit[] }>(GUEST_IDENTITY, HABITFLOW_SNAPSHOT_ROUTE)?.habits.map(
          (habit) => habit.name
        )
      ).toEqual(['من المتجر'])
    );
  });
});
