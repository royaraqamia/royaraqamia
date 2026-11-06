import type { AdminCertificate } from '@/frontend/api/certificates';
import type { StatusFilter } from '@/frontend/ui/admin/certificates-filter-bar';

export interface CertificatesLoadFailure {
  offline: boolean;
  message: string;
}

/**
 * The certificates page is one list view: the filter it is showing, the page it
 * is on, what it last read, and the row it is about to delete. Those moved
 * together before — a search rewrote three of them, a read rewrote four — so
 * they are one state here.
 */
export interface CertificatesListState {
  certificates: AdminCertificate[];
  total: number;
  page: number;
  search: string;
  debouncedSearch: string;
  statusFilter: StatusFilter;
  loading: boolean;
  deletingId: string | null;
  loadFailure: CertificatesLoadFailure | null;
  copiedId: string | null;
  deleteTarget: AdminCertificate | null;
}

export type CertificatesListAction =
  | { type: 'searchChanged'; search: string }
  | { type: 'searchCommitted'; search: string }
  | { type: 'pageChanged'; page: number }
  | { type: 'statusFilterChanged'; statusFilter: StatusFilter }
  | { type: 'loadStarted' }
  | { type: 'loaded'; certificates: AdminCertificate[]; total: number }
  | { type: 'loadFailed'; failure: CertificatesLoadFailure }
  | { type: 'deleteStarted'; id: string }
  | { type: 'deleteFinished' }
  | { type: 'deleteTargetChanged'; certificate: AdminCertificate | null }
  | { type: 'copyRaised'; id: string }
  | { type: 'copyCleared' };

export function certificatesListInitialState(): CertificatesListState {
  return {
    certificates: [],
    total: 0,
    page: 1,
    search: '',
    debouncedSearch: '',
    statusFilter: 'all',
    loading: true,
    deletingId: null,
    loadFailure: null,
    copiedId: null,
    deleteTarget: null,
  };
}

export function certificatesListReducer(
  state: CertificatesListState,
  action: CertificatesListAction
): CertificatesListState {
  switch (action.type) {
    case 'searchChanged':
      return { ...state, search: action.search };

    case 'searchCommitted':
      return { ...state, debouncedSearch: action.search, page: 1 };

    case 'pageChanged':
      return { ...state, page: action.page };

    case 'statusFilterChanged':
      return { ...state, statusFilter: action.statusFilter };

    case 'loadStarted':
      return { ...state, loading: true, loadFailure: null };

    case 'loaded':
      return {
        ...state,
        certificates: action.certificates,
        total: action.total,
        loading: false,
      };

    case 'loadFailed':
      // A failed read is not an empty list: keep the two apart.
      return {
        ...state,
        certificates: [],
        total: 0,
        loading: false,
        loadFailure: action.failure,
      };

    case 'deleteStarted':
      return { ...state, deletingId: action.id };

    case 'deleteFinished':
      return { ...state, deletingId: null, deleteTarget: null };

    case 'deleteTargetChanged':
      return { ...state, deleteTarget: action.certificate };

    case 'copyRaised':
      return { ...state, copiedId: action.id };

    case 'copyCleared':
      return state.copiedId === null ? state : { ...state, copiedId: null };
  }
}
