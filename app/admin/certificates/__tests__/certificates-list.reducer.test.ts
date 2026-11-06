import { describe, expect, it } from 'vitest';
import type { AdminCertificate } from '@/frontend/api/certificates';
import {
  certificatesListInitialState,
  certificatesListReducer,
  type CertificatesListState,
} from '@/app/admin/certificates/certificates-list.reducer';

const CERTIFICATE = { id: 'cert-1', code: 'ABC-123' } as unknown as AdminCertificate;

function stateOf(patch: Partial<CertificatesListState> = {}): CertificatesListState {
  return { ...certificatesListInitialState(), ...patch };
}

describe('certificatesListInitialState', () => {
  it('waits on the first page with nothing read yet', () => {
    expect(certificatesListInitialState()).toEqual({
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
    });
  });
});

describe('filtering', () => {
  it('keeps the typed search apart from the one being read', () => {
    const typing = certificatesListReducer(stateOf({ page: 3 }), {
      type: 'searchChanged',
      search: 'ض',
    });

    expect(typing).toMatchObject({ search: 'ض', debouncedSearch: '', page: 3 });
  });

  it('commits the search and returns to the first page', () => {
    const committed = certificatesListReducer(stateOf({ search: 'شهادة', page: 4 }), {
      type: 'searchCommitted',
      search: 'شهادة',
    });

    expect(committed).toMatchObject({ debouncedSearch: 'شهادة', page: 1 });
  });

  it('changes the status filter without touching the page', () => {
    expect(
      certificatesListReducer(stateOf({ page: 2 }), {
        type: 'statusFilterChanged',
        statusFilter: 'expired',
      })
    ).toMatchObject({ statusFilter: 'expired', page: 2 });
  });
});

describe('reading', () => {
  it('clears the previous failure when a read starts', () => {
    const state = certificatesListReducer(
      stateOf({ loadFailure: { offline: true, message: 'انقطع' } }),
      { type: 'loadStarted' }
    );

    expect(state).toMatchObject({ loading: true, loadFailure: null });
  });

  it('lands the page it read', () => {
    const state = certificatesListReducer(stateOf({ loading: true }), {
      type: 'loaded',
      certificates: [CERTIFICATE],
      total: 41,
    });

    expect(state).toMatchObject({
      certificates: [CERTIFICATE],
      total: 41,
      loading: false,
    });
  });

  it('never presents a failed read as an empty page', () => {
    const state = certificatesListReducer(
      stateOf({ certificates: [CERTIFICATE], total: 41, loading: true }),
      { type: 'loadFailed', failure: { offline: false, message: 'تعذّر' } }
    );

    expect(state).toMatchObject({
      certificates: [],
      total: 0,
      loading: false,
      loadFailure: { offline: false, message: 'تعذّر' },
    });
  });
});

describe('deleting', () => {
  it('tracks the row being deleted and lets go of both it and the dialog', () => {
    const started = certificatesListReducer(stateOf({ deleteTarget: CERTIFICATE }), {
      type: 'deleteStarted',
      id: 'cert-1',
    });

    expect(started.deletingId).toBe('cert-1');

    const finished = certificatesListReducer(started, { type: 'deleteFinished' });
    expect(finished).toMatchObject({ deletingId: null, deleteTarget: null });
  });

  it('opens and closes the confirm dialog', () => {
    const opened = certificatesListReducer(stateOf(), {
      type: 'deleteTargetChanged',
      certificate: CERTIFICATE,
    });
    expect(opened.deleteTarget).toBe(CERTIFICATE);

    expect(
      certificatesListReducer(opened, { type: 'deleteTargetChanged', certificate: null })
        .deleteTarget
    ).toBeNull();
  });
});

describe('copying', () => {
  it('marks the copied row and clears it afterwards', () => {
    const copied = certificatesListReducer(stateOf(), { type: 'copyRaised', id: 'cert-1' });
    expect(copied.copiedId).toBe('cert-1');

    expect(certificatesListReducer(copied, { type: 'copyCleared' }).copiedId).toBeNull();
  });
});
