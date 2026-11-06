import { describe, expect, it } from 'vitest';
import {
  adminListInitialState,
  adminListReducer,
  type AdminListState,
} from '@/frontend/state/admin/admin-list.reducer';

interface Row {
  id: string;
  status: string;
}

type Filter = 'all' | 'open' | 'closed';

type State = AdminListState<Row, Filter>;

const OPEN: Row = { id: 'r-1', status: 'open' };
const CLOSED: Row = { id: 'r-2', status: 'closed' };

function stateOf(patch: Partial<State> = {}): State {
  return { ...adminListInitialState<Row, Filter>('all'), ...patch };
}

describe('adminListInitialState', () => {
  it('waits on the first page with the given filter', () => {
    expect(adminListInitialState<Row, Filter>('open')).toEqual({
      rows: [],
      total: 0,
      page: 1,
      search: '',
      debouncedSearch: '',
      statusFilter: 'open',
      loading: true,
      savingId: null,
    });
  });
});

describe('filtering', () => {
  it('keeps the typed search apart from the read one', () => {
    const typing = adminListReducer(stateOf({ page: 2 }), {
      type: 'searchChanged',
      search: 'عميل',
    });

    expect(typing).toMatchObject({ search: 'عميل', debouncedSearch: '', page: 2 });
  });

  it('commits the search and returns to the first page', () => {
    expect(
      adminListReducer(stateOf({ search: 'عميل', page: 5 }), {
        type: 'searchCommitted',
        search: 'عميل',
      })
    ).toMatchObject({ debouncedSearch: 'عميل', page: 1 });
  });

  it('restarts the page when the status filter changes', () => {
    expect(
      adminListReducer(stateOf({ page: 4 }), {
        type: 'statusFilterChanged',
        statusFilter: 'closed',
      })
    ).toMatchObject({ statusFilter: 'closed', page: 1 });
  });

  it('moves to the requested page', () => {
    expect(adminListReducer(stateOf(), { type: 'pageChanged', page: 3 }).page).toBe(3);
  });
});

describe('reading', () => {
  it('lands the rows and the total', () => {
    const state = adminListReducer(stateOf({ loading: true }), {
      type: 'loaded',
      rows: [OPEN, CLOSED],
      total: 37,
    });

    expect(state).toMatchObject({ rows: [OPEN, CLOSED], total: 37, loading: false });
  });

  it('lowers the flag even when the read never landed', () => {
    const state = adminListReducer(stateOf({ loading: true }), { type: 'loadFinished' });

    expect(state.loading).toBe(false);
    expect(state.rows).toEqual([]);
  });

  it('does nothing to a list that is already settled', () => {
    const settled = stateOf({ loading: false });

    expect(adminListReducer(settled, { type: 'loadFinished' })).toBe(settled);
  });
});

describe('saving', () => {
  it('tracks the row whose save is in flight', () => {
    const saving = adminListReducer(stateOf(), { type: 'savingStarted', id: 'r-1' });
    expect(saving.savingId).toBe('r-1');

    expect(adminListReducer(saving, { type: 'savingFinished' }).savingId).toBeNull();
  });

  it('replaces the saved row in place and leaves the others alone', () => {
    const saved: Row = { id: 'r-1', status: 'closed' };
    const state = adminListReducer(stateOf({ rows: [OPEN, CLOSED], total: 2 }), {
      type: 'rowReplaced',
      row: saved,
    });

    expect(state.rows).toEqual([saved, CLOSED]);
    expect(state.total).toBe(2);
  });
});
