import { describe, expect, it } from 'vitest';

import type { LinkAnalyticsSummary } from '@/frontend/api/linksnap';
import {
  linkAnalyticsInitialState,
  linkAnalyticsReducer,
  type LinkAnalyticsState,
} from '@/frontend/state/linksnap/use-analytics.reducer';

const SUMMARY = { totalClicks: 4 } as unknown as LinkAnalyticsSummary;

function stateOf(patch: Partial<LinkAnalyticsState> = {}): LinkAnalyticsState {
  return { ...linkAnalyticsInitialState(), ...patch };
}

describe('linkAnalyticsInitialState', () => {
  it('starts closed, with nothing loading and no failure', () => {
    expect(linkAnalyticsInitialState()).toEqual({
      analytics: null,
      analyticsLoading: false,
      analyticsError: null,
      exportingCsv: false,
      exportCsvFailed: false,
    });
  });
});

describe('reading the summary', () => {
  it('drops the previous summary and its sentence when a new read starts', () => {
    const state = linkAnalyticsReducer(stateOf({ analytics: SUMMARY, analyticsError: 'قديم' }), {
      type: 'loadStarted',
    });

    expect(state).toMatchObject({
      analytics: null,
      analyticsLoading: true,
      analyticsError: null,
    });
  });

  it('lands the summary and finishes the read', () => {
    const state = linkAnalyticsReducer(stateOf({ analyticsLoading: true }), {
      type: 'loaded',
      analytics: SUMMARY,
    });

    expect(state).toMatchObject({ analytics: SUMMARY, analyticsLoading: false });
  });

  it('keeps the sentence and finishes the read when it failed', () => {
    expect(
      linkAnalyticsReducer(stateOf({ analyticsLoading: true }), {
        type: 'loadFailed',
        message: 'فشل في التحميل.',
      })
    ).toMatchObject({ analyticsLoading: false, analyticsError: 'فشل في التحميل.' });
  });

  it('closing the drawer forgets the summary but not the failure', () => {
    const state = linkAnalyticsReducer(stateOf({ analytics: SUMMARY }), { type: 'reset' });

    expect(state.analytics).toBeNull();
  });
});

describe('exporting the CSV', () => {
  it('clears the previous failure when an export starts', () => {
    expect(
      linkAnalyticsReducer(stateOf({ exportCsvFailed: true }), { type: 'exportStarted' })
    ).toMatchObject({ exportingCsv: true, exportCsvFailed: false });
  });

  it('records a failed export and finishes the request', () => {
    const failed = linkAnalyticsReducer(stateOf({ exportingCsv: true }), {
      type: 'exportFailed',
    });
    const finished = linkAnalyticsReducer(failed, { type: 'exportFinished' });

    expect(failed.exportCsvFailed).toBe(true);
    expect(finished.exportingCsv).toBe(false);
  });
});
