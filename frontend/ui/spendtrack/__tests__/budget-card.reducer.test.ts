import { describe, expect, it } from 'vitest';
import {
  budgetCardInitialState,
  budgetCardReducer,
} from '@/frontend/ui/spendtrack/budget-card.reducer';

describe('budgetCardInitialState', () => {
  it('starts loading with an empty draft', () => {
    expect(budgetCardInitialState()).toEqual({
      budget: null,
      input: '',
      loading: true,
      saving: false,
      error: null,
    });
  });
});

describe('loading the month', () => {
  it('paints the budget and its draft together', () => {
    const state = budgetCardReducer(budgetCardInitialState(), { type: 'loaded', budget: 250 });

    expect(state).toEqual({
      budget: 250,
      input: '250',
      loading: false,
      saving: false,
      error: null,
    });
  });

  it('leaves the draft empty when the month has no budget', () => {
    const state = budgetCardReducer(budgetCardInitialState(), { type: 'loaded', budget: null });

    expect(state).toMatchObject({ budget: null, input: '', loading: false });
  });

  it('names the reason and drops the spinner on failure', () => {
    const state = budgetCardReducer(budgetCardInitialState(), {
      type: 'loadFailed',
      message: 'تعذّر تحميل الميزانية.',
    });

    expect(state).toMatchObject({ loading: false, error: 'تعذّر تحميل الميزانية.' });
  });
});

describe('the draft', () => {
  it('is replaced by the typed value', () => {
    expect(
      budgetCardReducer(budgetCardInitialState(), { type: 'inputChanged', input: '42' })
    ).toMatchObject({ input: '42' });
  });
});

describe('saving', () => {
  it('raises the flag and clears the previous error', () => {
    const state = budgetCardReducer(
      { ...budgetCardInitialState(), error: 'فشل' },
      { type: 'saveStarted' }
    );

    expect(state).toMatchObject({ saving: true, error: null });
  });

  it('adopts the saved amount and settles the flag', () => {
    const state = budgetCardReducer(
      { ...budgetCardInitialState(), saving: true, loading: false },
      { type: 'saveSucceeded', budget: 100 }
    );

    expect(state).toMatchObject({ budget: 100, saving: false, error: null });
  });

  it('shows the reason and settles the flag when the save fails', () => {
    const state = budgetCardReducer(
      { ...budgetCardInitialState(), saving: true, loading: false },
      { type: 'saveFailed', message: 'تعذّر حفظ الميزانية.' }
    );

    expect(state).toMatchObject({ budget: null, saving: false, error: 'تعذّر حفظ الميزانية.' });
  });
});
