import { describe, expect, it } from 'vitest';
import type { AdminUserUsage } from '@/shared/contracts/plans';
import {
  plansViewInitialState,
  plansViewReducer,
} from '@/frontend/ui/admin/plans/plans-view.reducer';

const USER = { userId: 'u-1', email: 'a@example.com' } as unknown as AdminUserUsage;

describe('plansViewInitialState', () => {
  it('starts on the first page with no search and no dialog', () => {
    expect(plansViewInitialState()).toEqual({
      page: 1,
      searchInput: '',
      search: '',
      selected: null,
    });
  });
});

describe('the search', () => {
  it('keeps the draft separate from the applied term', () => {
    const state = plansViewReducer(plansViewInitialState(), {
      type: 'searchInputChanged',
      value: '  رنا  ',
    });

    expect(state).toMatchObject({ searchInput: '  رنا  ', search: '' });
  });

  it('applies the trimmed draft and returns to the first page', () => {
    const state = plansViewReducer(
      { page: 3, searchInput: 'رنا', search: '', selected: null },
      { type: 'searchSubmitted' }
    );

    expect(state).toMatchObject({ search: 'رنا', page: 1, searchInput: 'رنا' });
  });
});

describe('the pager', () => {
  it('never goes below the first page', () => {
    expect(plansViewReducer(plansViewInitialState(), { type: 'previousPage' }).page).toBe(1);
  });

  it('steps back and forward from the current page', () => {
    const s2 = plansViewReducer({ ...plansViewInitialState(), page: 2 }, { type: 'previousPage' });
    expect(s2.page).toBe(1);

    const s4 = plansViewReducer({ ...plansViewInitialState(), page: 2 }, { type: 'nextPage' });
    expect(s4.page).toBe(3);
  });
});

describe('the dialog', () => {
  it('opens on a row and closes back to nothing', () => {
    const opened = plansViewReducer(plansViewInitialState(), {
      type: 'userSelected',
      user: USER,
    });
    expect(opened.selected).toBe(USER);

    expect(plansViewReducer(opened, { type: 'dialogClosed' }).selected).toBeNull();
  });
});
