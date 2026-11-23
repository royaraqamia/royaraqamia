import { describe, expect, it } from 'vitest';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import type { SyncStatus } from '@/frontend/api/habitflow/sync-engine';
import {
  habitSyncInitialState,
  habitSyncReducer,
  IDLE_SYNC_STATUS,
  type HabitSyncViewState,
} from '@/frontend/state/habitflow/use-habit-sync.reducer';

function entry(seq: number): OutboxEntry {
  return {
    seq,
    id: `o-${seq}`,
    entity: 'habit',
    type: 'habit.create',
    payload: { clientId: `c-${seq}` },
    createdAt: seq,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
  };
}

function status(patch: Partial<SyncStatus> = {}): SyncStatus {
  return {
    syncing: false,
    pending: 0,
    failed: 0,
    lastError: null,
    lastFailedType: null,
    ...patch,
  };
}

function stateOf(patch: Partial<HabitSyncViewState> = {}): HabitSyncViewState {
  return { ...habitSyncInitialState(), ...patch };
}

describe('habitSyncInitialState', () => {
  it('starts idle with no queued rows', () => {
    expect(habitSyncInitialState()).toEqual({ status: IDLE_SYNC_STATUS, entries: [] });
  });
});

describe('the engine status', () => {
  it('lands the status without touching the Outbox', () => {
    const entries = [entry(1)];
    const next = habitSyncReducer(stateOf({ entries }), {
      type: 'statusChanged',
      status: status({ syncing: true, pending: 1 }),
    });

    expect(next.status).toMatchObject({ syncing: true, pending: 1 });
    expect(next.entries).toBe(entries);
  });

  it('drops to idle when there is no store or no account', () => {
    const entries = [entry(1)];
    const next = habitSyncReducer(stateOf({ status: status({ pending: 1 }), entries }), {
      type: 'syncIdle',
    });

    expect(next.status).toBe(IDLE_SYNC_STATUS);
    expect(next.entries).toBe(entries);
  });
});

describe('the Outbox mirror', () => {
  it('replaces the rows with what the store answered', () => {
    const entries = [entry(1), entry(2)];

    expect(habitSyncReducer(stateOf(), { type: 'entriesLoaded', entries }).entries).toBe(entries);
  });

  it('empties the rows when the store goes away', () => {
    expect(
      habitSyncReducer(stateOf({ entries: [entry(1)] }), { type: 'entriesCleared' }).entries
    ).toEqual([]);
  });
});
