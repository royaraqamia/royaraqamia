import { describe, expect, it } from 'vitest';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import type { SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import {
  EMPTY_LEAD_STATUS,
  leadSubmissionInitialState,
  leadSubmissionReducer,
  type LeadSubmissionViewState,
} from '@/frontend/state/leads/use-lead-submission.reducer';

function entry(seq: number, type = 'training.submit'): OutboxEntry {
  return {
    seq,
    id: `o-${seq}`,
    entity: 'lead',
    type,
    payload: { client_id: `c-${seq}` },
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

function stateOf(patch: Partial<LeadSubmissionViewState> = {}): LeadSubmissionViewState {
  return { ...leadSubmissionInitialState(), ...patch };
}

describe('leadSubmissionInitialState', () => {
  it('starts idle with an empty queue', () => {
    expect(leadSubmissionInitialState()).toEqual({ status: EMPTY_LEAD_STATUS, entries: [] });
  });
});

describe('switching account', () => {
  it('drops the previous account rows and counts', () => {
    const state = stateOf({
      status: status({ pending: 2, failed: 1, lastError: 'انقطع' }),
      entries: [entry(1), entry(2)],
    });

    expect(leadSubmissionReducer(state, { type: 'reset' })).toEqual({
      status: EMPTY_LEAD_STATUS,
      entries: [],
    });
  });

  it('keeps the same state object when the queue is already empty and idle', () => {
    const state = stateOf();
    expect(leadSubmissionReducer(state, { type: 'reset' })).toBe(state);
  });

  it('keeps a status the reset does not track, while still dropping the rows', () => {
    const state = stateOf({ status: status({ syncing: true }), entries: [entry(1)] });

    expect(leadSubmissionReducer(state, { type: 'reset' })).toEqual({
      status: status({ syncing: true }),
      entries: [],
    });
  });
});

describe('the engine and the queue', () => {
  it('lands the status without touching the rows', () => {
    const entries = [entry(1)];
    const next = leadSubmissionReducer(stateOf({ entries }), {
      type: 'statusChanged',
      status: status({ syncing: true, pending: 1 }),
    });

    expect(next.status).toMatchObject({ syncing: true, pending: 1 });
    expect(next.entries).toBe(entries);
  });

  it('replaces the rows with what the store answered', () => {
    const entries = [entry(1), entry(2, 'subscription.submit')];

    expect(leadSubmissionReducer(stateOf(), { type: 'entriesLoaded', entries }).entries).toBe(
      entries
    );
  });
});
