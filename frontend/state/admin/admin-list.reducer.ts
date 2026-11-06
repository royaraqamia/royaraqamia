/**
 * The admin list pages (`/admin/plans/requests`, `/admin/clients/retainers`,
 * `/admin/clients/project-requests`, `/admin/training/applications`) carried the
 * same eight `useState` calls: the rows, the page, the typed search and the one
 * being read, the status filter, the loading flag and the row being saved. Every
 * handler wrote two or three of them, so they are one transition here.
 *
 * Kept generic over the row and the filter so each page keeps its own contract
 * types — the reducer knows only that a row has an id.
 */

export interface AdminListRow {
  id: string;
}

export interface AdminListState<Row extends AdminListRow, Filter extends string> {
  rows: Row[];
  total: number;
  page: number;
  /** What the operator has typed, debounced separately. */
  search: string;
  debouncedSearch: string;
  statusFilter: Filter;
  loading: boolean;
  /** The row whose save is in flight, if any. */
  savingId: string | null;
}

export type AdminListAction<Row extends AdminListRow, Filter extends string> =
  | { type: 'searchChanged'; search: string }
  | { type: 'searchCommitted'; search: string }
  | { type: 'pageChanged'; page: number }
  | { type: 'statusFilterChanged'; statusFilter: Filter }
  | { type: 'loadStarted' }
  | { type: 'loaded'; rows: Row[]; total: number }
  | { type: 'loadFinished' }
  | { type: 'savingStarted'; id: string }
  | { type: 'savingFinished' }
  | { type: 'rowReplaced'; row: Row };

export function adminListInitialState<Row extends AdminListRow, Filter extends string>(
  statusFilter: Filter
): AdminListState<Row, Filter> {
  return {
    rows: [],
    total: 0,
    page: 1,
    search: '',
    debouncedSearch: '',
    statusFilter,
    loading: true,
    savingId: null,
  };
}

export function adminListReducer<Row extends AdminListRow, Filter extends string>(
  state: AdminListState<Row, Filter>,
  action: AdminListAction<Row, Filter>
): AdminListState<Row, Filter> {
  switch (action.type) {
    case 'searchChanged':
      return { ...state, search: action.search };

    case 'searchCommitted':
      return { ...state, debouncedSearch: action.search, page: 1 };

    case 'pageChanged':
      return { ...state, page: action.page };

    case 'statusFilterChanged':
      // A different filter is a different result set, so the page restarts.
      return { ...state, statusFilter: action.statusFilter, page: 1 };

    case 'loadStarted':
      return { ...state, loading: true };

    case 'loaded':
      return { ...state, rows: action.rows, total: action.total, loading: false };

    case 'loadFinished':
      return state.loading ? { ...state, loading: false } : state;

    case 'savingStarted':
      return { ...state, savingId: action.id };

    case 'savingFinished':
      return state.savingId === null ? state : { ...state, savingId: null };

    case 'rowReplaced':
      return {
        ...state,
        rows: state.rows.map((row) => (row.id === action.row.id ? action.row : row)),
      };
  }
}
