import type { LinkAnalyticsSummary } from '@/frontend/api/linksnap';

/**
 * One link's analytics drawer: the summary a read painted, the read in flight,
 * its sentence, and the CSV export's own two flags.
 *
 * The read wrote the summary, the loading flag and the error from one
 * `try/finally`; the export wrote its flag and its failure from another — so
 * they are one state here.
 */
export interface LinkAnalyticsState {
  analytics: LinkAnalyticsSummary | null;
  analyticsLoading: boolean;
  analyticsError: string | null;
  exportingCsv: boolean;
  exportCsvFailed: boolean;
}

export type LinkAnalyticsAction =
  | { type: 'loadStarted' }
  | { type: 'loaded'; analytics: LinkAnalyticsSummary }
  | { type: 'loadFailed'; message: string }
  | { type: 'reset' }
  | { type: 'exportStarted' }
  | { type: 'exportFailed' }
  | { type: 'exportFinished' };

export function linkAnalyticsInitialState(): LinkAnalyticsState {
  return {
    analytics: null,
    analyticsLoading: false,
    analyticsError: null,
    exportingCsv: false,
    exportCsvFailed: false,
  };
}

export function linkAnalyticsReducer(
  state: LinkAnalyticsState,
  action: LinkAnalyticsAction
): LinkAnalyticsState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, analytics: null, analyticsLoading: true, analyticsError: null };

    case 'loaded':
      return { ...state, analytics: action.analytics, analyticsLoading: false };

    case 'loadFailed':
      return { ...state, analyticsError: action.message, analyticsLoading: false };

    case 'reset':
      return { ...state, analytics: null };

    case 'exportStarted':
      return { ...state, exportingCsv: true, exportCsvFailed: false };

    case 'exportFailed':
      return { ...state, exportCsvFailed: true };

    case 'exportFinished':
      return { ...state, exportingCsv: false };
  }
}
