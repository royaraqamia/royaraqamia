'use client';

import { useEffect, useState } from 'react';

/**
 * The reference code a public form last issued, remembered on the device.
 *
 * The confirmation a flow shows lives in React memory, so a refresh would drop
 * it and hand the visitor a blank form — losing the one thing they were told to
 * keep. `localStorage` survives a refresh, a new tab and a browser restart on
 * the same device, so the visitor can come back to their code later. It is
 * cleared when they start a new submission with the same form.
 *
 * It is a UI convenience only: it carries no authority, and the code is never
 * trusted for editing, which still requires the account. Nothing secret is
 * stored — the reference code is already shown on screen and quoted on WhatsApp.
 */
export const SUBMISSION_RECEIPT_KEYS = {
  consultation: 'rr:receipt:consultation',
  training: 'rr:receipt:training',
  projectRequest: 'rr:receipt:project-request',
  retainer: 'rr:receipt:retainer',
} as const;

export type SubmissionKind = keyof typeof SUBMISSION_RECEIPT_KEYS;

/**
 * How long a remembered receipt stays useful. A code from months ago is noise
 * on the form, not the confirmation the visitor is looking for, so the read
 * drops anything past this age on the device clock.
 */
export const RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Fired on `window` whenever a receipt is written, so a form that queued a
 * submission offline can flip to its confirmation the instant the Outbox replay
 * lands the Reference Code (ticket #169), without polling or reloading.
 */
export const SUBMISSION_RECEIPT_EVENT = 'rr:submission-receipt';

interface SubmissionReceiptEventDetail {
  kind: SubmissionKind;
  code: string;
}

function emitSubmissionReceipt(kind: SubmissionKind, code: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SubmissionReceiptEventDetail>(SUBMISSION_RECEIPT_EVENT, {
      detail: { kind, code },
    })
  );
}

interface StoredReceipt {
  code: string;
  at: number;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Private-mode or blocked storage must not break the form.
    return null;
  }
}

export function readSubmissionReceipt(kind: SubmissionKind): string | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(SUBMISSION_RECEIPT_KEYS[kind]);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredReceipt>;
    const code = typeof parsed?.code === 'string' ? parsed.code : null;
    const at = typeof parsed?.at === 'number' ? parsed.at : null;

    if (code === null || at === null || Date.now() - at > RECEIPT_TTL_MS) {
      // Unparseable, older-shaped or expired: unusable, so drop it rather than
      // leave dead state on the device.
      store.removeItem(SUBMISSION_RECEIPT_KEYS[kind]);
      return null;
    }

    return code;
  } catch {
    // A malformed row throws on parse; clear it and report nothing.
    try {
      store.removeItem(SUBMISSION_RECEIPT_KEYS[kind]);
    } catch {
      // Storage may be read-only; nothing more to do.
    }
    return null;
  }
}

export function writeSubmissionReceipt(kind: SubmissionKind, referenceCode: string): void {
  try {
    const payload: StoredReceipt = { code: referenceCode, at: Date.now() };
    storage()?.setItem(SUBMISSION_RECEIPT_KEYS[kind], JSON.stringify(payload));
  } catch {
    // A full or unavailable store only costs the persistence fallback, never the submit.
  }
  emitSubmissionReceipt(kind, referenceCode);
}

export function clearSubmissionReceipt(kind: SubmissionKind): void {
  try {
    storage()?.removeItem(SUBMISSION_RECEIPT_KEYS[kind]);
  } catch {
    // Nothing to do.
  }
}

/**
 * The remembered receipt for one form, read once on mount. Returns `null` on
 * the server and on the first client render so hydration matches, then the
 * stored code on the effect pass.
 *
 * A stored receipt is treated as stale once it is older than {@link RECEIPT_TTL_MS}:
 * a code from months ago is noise, not a confirmation the visitor is looking
 * for. The write stamps the time so the read can drop it.
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
