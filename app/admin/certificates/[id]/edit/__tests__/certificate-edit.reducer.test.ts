import { describe, expect, it } from 'vitest';

import type { AdminCertificate } from '@/frontend/api/certificates';
import {
  certificateEditInitialState,
  certificateEditReducer,
  type CertificateEditState,
} from '@/app/admin/certificates/[id]/edit/certificate-edit.reducer';

const CERT = { id: 'cert-1', certificate_code: 'ABC' } as unknown as AdminCertificate;

function stateOf(patch: Partial<CertificateEditState> = {}): CertificateEditState {
  return { ...certificateEditInitialState(), ...patch };
}

describe('certificateEditInitialState', () => {
  it('waits on the first read with nothing painted', () => {
    expect(certificateEditInitialState()).toEqual({
      loading: true,
      cert: null,
      loadFailure: null,
      reloadKey: 0,
    });
  });
});

describe('reading the certificate', () => {
  it('clears the previous failure when a read starts', () => {
    expect(
      certificateEditReducer(
        stateOf({ loading: false, loadFailure: { offline: true, message: 'انقطع' } }),
        { type: 'loadStarted' }
      )
    ).toMatchObject({ loading: true, loadFailure: null });
  });

  it('lands the row and finishes the read', () => {
    expect(certificateEditReducer(stateOf(), { type: 'loaded', cert: CERT })).toMatchObject({
      cert: CERT,
      loading: false,
    });
  });

  it('accepts an answer that carries no row', () => {
    expect(certificateEditReducer(stateOf(), { type: 'loaded', cert: null })).toMatchObject({
      cert: null,
      loading: false,
    });
  });

  it('drops the row and records why when the read failed', () => {
    expect(
      certificateEditReducer(stateOf({ cert: CERT }), {
        type: 'loadFailed',
        failure: { offline: false, message: 'تعذّر تحميل الشهادة.' },
      })
    ).toMatchObject({
      cert: null,
      loading: false,
      loadFailure: { offline: false, message: 'تعذّر تحميل الشهادة.' },
    });
  });
});

describe('retrying', () => {
  it('bumps the key so the read runs again', () => {
    expect(
      certificateEditReducer(stateOf({ reloadKey: 2 }), { type: 'reloadRequested' }).reloadKey
    ).toBe(3);
  });
});
