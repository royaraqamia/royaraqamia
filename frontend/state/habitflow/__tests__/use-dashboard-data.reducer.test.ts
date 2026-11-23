import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '@/shared/contracts/habitflow';
import type { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';
import {
  dashboardDataInitialState,
  dashboardDataReducer,
  type DashboardDataState,
} from '@/frontend/state/habitflow/use-dashboard-data.reducer';

function habit(id: string): Habit {
  return {
    id,
    name: `habit-${id}`,
    frequency: 'daily',
    createdAt: '2026-01-01T00:00:00.000Z',
    archived: false,
  };
}

function log(id: string): HabitLog {
  return {
    id,
    habitId: 'h-1',
    date: '2026-08-02',
    completed: false,
    completedAt: null,
  };
}

const STORE = {} as HabitLocalStore;

function stateOf(patch: Partial<DashboardDataState> = {}): DashboardDataState {
  return {
    ...dashboardDataInitialState({ habits: [], logs: [], mode: 'local', user: null }),
    ...patch,
  };
}

describe('dashboardDataInitialState', () => {
  it('starts from the server seed with no store open', () => {
    expect(
      dashboardDataInitialState({
        habits: [habit('h-1')],
        logs: [log('l-1')],
        mode: 'supabase',
        user: { id: 'u-1' },
      })
    ).toMatchObject({
      habits: [habit('h-1')],
      logs: [log('l-1')],
      mode: 'supabase',
      user: { id: 'u-1' },
      store: null,
      loadedFor: null,
    });
  });
});

describe('opening the store', () => {
  it('carries the store, both row lists and the identity together', () => {
    const next = dashboardDataReducer(stateOf(), {
      type: 'storeOpened',
      store: STORE,
      habits: [habit('h-1')],
      logs: [log('l-1')],
      identity: userIdentity('u-1'),
    });

    expect(next).toMatchObject({
      store: STORE,
      habits: [habit('h-1')],
      logs: [log('l-1')],
      loadedFor: userIdentity('u-1'),
    });
  });
});

describe('reading the store again', () => {
  it('replaces both lists and leaves the store alone', () => {
    const next = dashboardDataReducer(
      stateOf({ store: STORE, habits: [habit('old')], loadedFor: GUEST_IDENTITY }),
      { type: 'dataRefreshed', habits: [habit('new')], logs: [log('l-1')] }
    );

    expect(next.habits).toEqual([habit('new')]);
    expect(next.logs).toEqual([log('l-1')]);
    expect(next.store).toBe(STORE);
  });
});

describe('syncing the session user', () => {
  it('moves the surface to Supabase for a signed-in user', () => {
    const next = dashboardDataReducer(stateOf(), {
      type: 'userSynced',
      user: { id: 'u-1' },
    });

    expect(next).toMatchObject({ user: { id: 'u-1' }, mode: 'supabase' });
  });

  it('leaves the mode alone for a signed-out user', () => {
    const next = dashboardDataReducer(stateOf({ mode: 'local' }), {
      type: 'userSynced',
      user: null,
    });

    expect(next).toMatchObject({ user: null, mode: 'local' });
  });
});

describe('the exposed setters', () => {
  it('resolves a functional habits update against the previous rows', () => {
    const next = dashboardDataReducer(stateOf({ habits: [habit('h-1')] }), {
      type: 'habitsSet',
      update: (previous) => [...previous, habit('h-2')],
    });

    expect(next.habits.map((row) => row.id)).toEqual(['h-1', 'h-2']);
  });

  it('resolves a functional logs update against the previous rows', () => {
    const next = dashboardDataReducer(stateOf({ logs: [log('l-1')] }), {
      type: 'logsSet',
      update: (previous) => previous.filter((row) => row.id !== 'l-1'),
    });

    expect(next.logs).toEqual([]);
  });

  it('sets the mode directly', () => {
    expect(dashboardDataReducer(stateOf(), { type: 'modeSet', update: 'supabase' }).mode).toBe(
      'supabase'
    );
  });

  it('sets the user directly', () => {
    expect(
      dashboardDataReducer(stateOf(), { type: 'userSet', update: { id: 'u-2' } }).user
    ).toEqual({ id: 'u-2' });
  });
});
