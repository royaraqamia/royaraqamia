import { describe, expect, it } from 'vitest';

import type { ChatReportRow } from '@/shared/contracts/chat-reports';
import {
  chatReportsInitialState,
  chatReportsReducer,
  type ChatReportsState,
} from '@/frontend/ui/admin/chat-reports/chat-reports-view.reducer';

function report(patch: Partial<ChatReportRow> = {}): ChatReportRow {
  return {
    id: 'report-1',
    conversation: { id: 'conversation-1', kind: 'group', title: '' },
    reporter: { id: 'u1', username: 'sara', name: 'سارة' },
    reportedUser: { id: 'u2', username: 'bad', name: 'خالد' },
    reason: 'إساءة',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    snapshot: [],
    ...patch,
  };
}

function stateOf(patch: Partial<ChatReportsState> = {}): ChatReportsState {
  return { ...chatReportsInitialState('open'), ...patch };
}

describe('chatReportsInitialState', () => {
  it('waits on the first read under the given filter', () => {
    expect(chatReportsInitialState('open')).toEqual({
      statusFilter: 'open',
      reports: [],
      loading: true,
      error: false,
      decidingId: null,
    });
  });
});

describe('the queue', () => {
  it('changes the filter without touching the rows', () => {
    const rows = [report()];

    expect(
      chatReportsReducer(stateOf({ reports: rows }), {
        type: 'filterChanged',
        filter: 'reviewed',
      })
    ).toMatchObject({ statusFilter: 'reviewed', reports: rows });
  });

  it('clears the previous failure when a read starts', () => {
    expect(
      chatReportsReducer(stateOf({ error: true, loading: false }), { type: 'loadStarted' })
    ).toMatchObject({ loading: true, error: false });
  });

  it('lands the rows and finishes the read', () => {
    const rows = [report()];

    expect(chatReportsReducer(stateOf(), { type: 'loaded', reports: rows })).toMatchObject({
      reports: rows,
      loading: false,
    });
  });

  it('records the failure and finishes the read', () => {
    expect(chatReportsReducer(stateOf(), { type: 'loadFailed' })).toMatchObject({
      error: true,
      loading: false,
    });
  });
});

describe('deciding a report', () => {
  it('marks the row in flight and clears the flag when it settles', () => {
    const started = chatReportsReducer(stateOf(), { type: 'decideStarted', id: 'report-1' });
    const finished = chatReportsReducer(started, { type: 'decideFinished' });

    expect(started.decidingId).toBe('report-1');
    expect(finished.decidingId).toBeNull();
  });

  it('replaces the row under an all filter', () => {
    const updated = report({ status: 'reviewed' });
    const state = chatReportsReducer(stateOf({ statusFilter: 'all', reports: [report()] }), {
      type: 'decided',
      report: updated,
    });

    expect(state.reports).toEqual([updated]);
  });

  it('drops a row that no longer matches the active filter', () => {
    const state = chatReportsReducer(stateOf({ statusFilter: 'open', reports: [report()] }), {
      type: 'decided',
      report: report({ status: 'reviewed' }),
    });

    expect(state.reports).toEqual([]);
  });

  it('keeps every other row', () => {
    const other = report({ id: 'report-2', reason: 'ثانٍ' });
    const state = chatReportsReducer(
      stateOf({ statusFilter: 'open', reports: [report(), other] }),
      { type: 'decided', report: report({ status: 'reviewed' }) }
    );

    expect(state.reports).toEqual([other]);
  });
});
