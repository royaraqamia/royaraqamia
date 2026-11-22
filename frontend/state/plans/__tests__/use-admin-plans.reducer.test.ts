import { describe, expect, it } from 'vitest';
import type { AdminPlansResult } from '@/frontend/api/admin/plans';
import {
  adminPlansInitialState,
  adminPlansReducer,
} from '@/frontend/state/plans/use-admin-plans.reducer';

const RESULT = { total: 1, pageSize: 25, users: [] } as unknown as AdminPlansResult;

describe('adminPlansInitialState', () => {
  it('starts loading with nothing painted and no error', () => {
    expect(adminPlansInitialState()).toEqual({ result: null, loading: true, error: null });
  });
});

describe('a load', () => {
  it('raises the spinner and clears the error', () => {
    const state = adminPlansReducer(
      { result: null, loading: false, error: 'فشل' },
      { type: 'loadStarted' }
    );

    expect(state).toEqual({ result: null, loading: true, error: null });
  });

  it('paints the page and settles the spinner on success', () => {
    expect(
      adminPlansReducer(adminPlansInitialState(), { type: 'loadSucceeded', result: RESULT })
    ).toEqual({ result: RESULT, loading: false, error: null });
  });

  it('keeps the last page and shows the reason on failure', () => {
    const state = adminPlansReducer(
      { result: RESULT, loading: true, error: null },
      { type: 'loadFailed', message: 'تعذّر تحميل قائمة الاشتراكات.' }
    );

    expect(state).toEqual({
      result: RESULT,
      loading: false,
      error: 'تعذّر تحميل قائمة الاشتراكات.',
    });
  });
});
