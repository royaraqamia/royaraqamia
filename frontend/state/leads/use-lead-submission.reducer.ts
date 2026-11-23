import type { SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

/**
 * The lead Outbox and the engine status drawn from it. The account's queue is
 * counted and reset as one unit — a different account meant the previous one's
 * counts and entries both had to go — so the pair is one state here. The
 * `ready` and `online` flags are independent of that pair and stay `useState`.
 */
export interface LeadSubmissionViewState {
  status: SyncStatus;
  entries: OutboxEntry[];
}

export type LeadSubmissionAction =
  /** A different account: drop the previous queue's rows and counts. */
  | { type: 'reset' }
  | { type: 'statusChanged'; status: SyncStatus }
  | { type: 'entriesLoaded'; entries: OutboxEntry[] };

export const EMPTY_LEAD_STATUS: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

export function leadSubmissionInitialState(): LeadSubmissionViewState {
  return { status: EMPTY_LEAD_STATUS, entries: [] };
}

export function leadSubmissionReducer(
  state: LeadSubmissionViewState,
  action: LeadSubmissionAction
): LeadSubmissionViewState {
  switch (action.type) {
    // Only the fields the queue tracks decide the reset; an unchanged queue
    // keeps its identity so React does not repaint for nothing (as the two
    // functional setters did).
    case 'reset': {
      const statusNeedsReset = !(
        state.status.pending === 0 &&
        state.status.failed === 0 &&
        state.status.lastError === null
      );
      const entriesNeedReset = state.entries.length !== 0;
      if (!statusNeedsReset && !entriesNeedReset) return state;
      return {
        status: statusNeedsReset ? EMPTY_LEAD_STATUS : state.status,
        entries: entriesNeedReset ? [] : state.entries,
      };
    }

    case 'statusChanged':
      return { ...state, status: action.status };

    case 'entriesLoaded':
      return { ...state, entries: action.entries };
  }
}
