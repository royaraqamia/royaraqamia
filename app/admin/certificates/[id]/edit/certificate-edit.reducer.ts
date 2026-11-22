import type { AdminCertificate } from '@/frontend/api/certificates';

export interface CertificateLoadFailure {
  offline: boolean;
  message: string;
}

/**
 * One certificate's edit page: the row it read, the read in flight, the failure
 * it answered with and the retry counter that asks for another read.
 *
 * The read wrote the loading flag, the row and the failure from one
 * `try/finally`, and a retry nudged its own counter — so they are one state
 * here.
 */
export interface CertificateEditState {
  loading: boolean;
  cert: AdminCertificate | null;
  loadFailure: CertificateLoadFailure | null;
  reloadKey: number;
}

export type CertificateEditAction =
  | { type: 'loadStarted' }
  | { type: 'loaded'; cert: AdminCertificate | null }
  | { type: 'loadFailed'; failure: CertificateLoadFailure }
  | { type: 'reloadRequested' };

export function certificateEditInitialState(): CertificateEditState {
  return { loading: true, cert: null, loadFailure: null, reloadKey: 0 };
}

export function certificateEditReducer(
  state: CertificateEditState,
  action: CertificateEditAction
): CertificateEditState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loading: true, loadFailure: null };

    case 'loaded':
      return { ...state, cert: action.cert, loading: false };

    case 'loadFailed':
      return { ...state, cert: null, loadFailure: action.failure, loading: false };

    case 'reloadRequested':
      return { ...state, reloadKey: state.reloadKey + 1 };
  }
}
