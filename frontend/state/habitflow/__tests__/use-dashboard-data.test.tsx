import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
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

  it('reads the namespace that matches the signed-in identity', async () => {
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

    await waitFor(() => expect(screen.getByTestId('habits').textContent).toBe('بيانات المستخدم'));
  });
});
