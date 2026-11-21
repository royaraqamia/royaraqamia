import type { ChatReportRow, ChatReportStatus } from '@/shared/contracts/chat-reports';

export type ChatReportsStatusFilter = ChatReportStatus | 'all';

/**
 * The report queue: the rows, the filter, the read in flight, its failure and
 * the row being decided.
 *
 * `load` wrote the rows, the flag and the failure from one `try/finally`, and
 * a decision either replaced the row or dropped it from a filtered view — so
 * they are one state here, and the filter is what decides the drop.
 */
export interface ChatReportsState {
  statusFilter: ChatReportsStatusFilter;
  reports: ChatReportRow[];
  loading: boolean;
  error: boolean;
  decidingId: string | null;
}

export type ChatReportsAction =
  | { type: 'filterChanged'; filter: ChatReportsStatusFilter }
  | { type: 'loadStarted' }
  | { type: 'loaded'; reports: ChatReportRow[] }
  | { type: 'loadFailed' }
  | { type: 'decideStarted'; id: string }
  | { type: 'decided'; report: ChatReportRow }
  | { type: 'decideFinished' };

export function chatReportsInitialState(statusFilter: ChatReportsStatusFilter): ChatReportsState {
  return { statusFilter, reports: [], loading: true, error: false, decidingId: null };
}

export function chatReportsReducer(
  state: ChatReportsState,
  action: ChatReportsAction
): ChatReportsState {
  switch (action.type) {
    case 'filterChanged':
      return { ...state, statusFilter: action.filter };

    case 'loadStarted':
      return { ...state, loading: true, error: false };

    case 'loaded':
      return { ...state, reports: action.reports, loading: false };

    case 'loadFailed':
      return { ...state, error: true, loading: false };

    case 'decideStarted':
      return { ...state, decidingId: action.id };

    case 'decided':
      return {
        ...state,
        reports: state.reports.flatMap((row) => {
          if (row.id !== action.report.id) return [row];
          if (state.statusFilter === 'all' || state.statusFilter === action.report.status) {
            return [action.report];
          }
          return [];
        }),
      };

    case 'decideFinished':
      return state.decidingId === null ? state : { ...state, decidingId: null };
  }
}
