'use client';

import { useCallback, useReducer } from 'react';
import {
  exportAnalyticsCsv,
  fetchAnalytics,
  type AnalyticsRangeFilter,
} from '@/frontend/api/linksnap';
import { buildCsv } from '@/frontend/ui/linksnap/csv-export';
import {
  linkAnalyticsInitialState,
  linkAnalyticsReducer,
} from '@/frontend/state/linksnap/use-analytics.reducer';

export function useLinkAnalytics(code: string, token: string) {
  const [state, dispatch] = useReducer(linkAnalyticsReducer, undefined, linkAnalyticsInitialState);
  const { analytics, analyticsLoading, analyticsError, exportingCsv, exportCsvFailed } = state;

  const loadAnalytics = useCallback(
    async (range?: AnalyticsRangeFilter) => {
      dispatch({ type: 'loadStarted' });
      try {
        dispatch({ type: 'loaded', analytics: await fetchAnalytics(code, token, range) });
      } catch (err: unknown) {
        dispatch({
          type: 'loadFailed',
          message: err instanceof Error ? err.message : 'فشل في تحميل التَّحليلات.',
        });
      }
    },
    [code, token]
  );

  const exportCsv = useCallback(
    async (range: AnalyticsRangeFilter | undefined): Promise<string | null> => {
      dispatch({ type: 'exportStarted' });
      try {
        const rows = await exportAnalyticsCsv(code, token, range);
        return buildCsv(rows);
      } catch {
        dispatch({ type: 'exportFailed' });
        return null;
      } finally {
        dispatch({ type: 'exportFinished' });
      }
    },
    [code, token]
  );

  const resetAnalytics = useCallback(() => dispatch({ type: 'reset' }), []);

  return {
    analytics,
    analyticsLoading,
    analyticsError,
    exportingCsv,
    exportCsvFailed,
    loadAnalytics,
    exportCsv,
    resetAnalytics,
  };
}
