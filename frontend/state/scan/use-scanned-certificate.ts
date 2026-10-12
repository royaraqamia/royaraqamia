'use client';

import { useEffect, useState } from 'react';
import { verifyCertificate } from '@/frontend/api/certificates';
import { certificateCodeFromPayload } from '@/shared/contracts/scan';
import { getCanonicalOrigin } from '@/frontend/shared/constants';
import type { PublicCertificate } from '@/shared/contracts/certificates';

export type ScannedCertificateState =
  | { status: 'none' }
  | { status: 'loading'; code: string }
  | { status: 'ok'; code: string; certificate: PublicCertificate }
  | { status: 'unavailable'; code: string; message: string | null };

/**
 * A Scan Result that is one of our own `/verify/<code>` links is looked up
 * against the existing public Certificate API, so a scanned certificate renders
 * the Certificate card instead of a bare URL. Every other payload — and every
 * failure, including being offline — resolves to `unavailable`, and the page
 * falls back to offering the link.
 */
export function useScannedCertificate(payload: string | null): ScannedCertificateState {
  const code = payload ? certificateCodeFromPayload(payload, getCanonicalOrigin()) : null;
  const [state, setState] = useState<ScannedCertificateState>({ status: 'none' });

  useEffect(() => {
    if (!code) {
      setState({ status: 'none' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', code });

    void (async () => {
      const result = await verifyCertificate(code);
      if (cancelled) return;
      if (result.success && result.certificate) {
        setState({ status: 'ok', code, certificate: result.certificate });
      } else {
        setState({ status: 'unavailable', code, message: result.error ?? null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return state;
}
