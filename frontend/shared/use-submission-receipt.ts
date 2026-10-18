'use client';

import { useEffect, useState } from 'react';

import {
  clearSubmissionReceipt,
  readSubmissionReceipt,
  RECEIPT_TTL_MS,
  SUBMISSION_RECEIPT_EVENT,
  writeSubmissionReceipt,
  type SubmissionKind,
  type SubmissionReceiptEventDetail,
} from '@/frontend/shared/submission-receipt';

/**
 * The remembered receipt for one form, read once on mount. Returns `null` on
 * the server and on the first client render so hydration matches, then the
 * stored code on the effect pass.
 *
 * A stored receipt is treated as stale once it is older than {@link RECEIPT_TTL_MS}:
 * a code from months ago is noise, not a confirmation the visitor is looking
 * for. The write stamps the time so the read can drop it.
 *
 * The hook is split out from the storage module it reads: the Outbox transports
 * and the service worker write receipts without a React tree, so
 * `submission-receipt.ts` has to stay importable from a worker. See its header.
 */
export function useSubmissionReceipt(kind: SubmissionKind): {
  referenceCode: string | null;
  remember: (referenceCode: string) => void;
  dismiss: () => void;
} {
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  useEffect(() => {
    setReferenceCode(readSubmissionReceipt(kind));

    // A queued submission is delivered by the Outbox Sync Engine after this hook
    // mounted; the transport writes the receipt and announces it here.
    const onReceipt = (event: Event) => {
      const detail = (event as CustomEvent<SubmissionReceiptEventDetail>).detail;
      if (detail?.kind === kind) setReferenceCode(detail.code);
    };
    window.addEventListener(SUBMISSION_RECEIPT_EVENT, onReceipt);
    return () => window.removeEventListener(SUBMISSION_RECEIPT_EVENT, onReceipt);
  }, [kind]);

  return {
    referenceCode,
    remember: (code: string) => {
      writeSubmissionReceipt(kind, code);
      setReferenceCode(code);
    },
    dismiss: () => {
      clearSubmissionReceipt(kind);
      setReferenceCode(null);
    },
  };
}
