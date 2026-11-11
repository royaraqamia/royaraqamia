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
 *
 * A form whose request belongs to an account (the subscription request) keys its
 * receipt by that account, so a shared browser never shows one member's code to
 * the next one (#1084). The anonymous forms stay device-wide.
 *
 * **This module must stay free of React.** The Outbox transports write a receipt
 * when a queued submission finally lands, and the worker realm reads one when a
 * background flush does — neither is a component. A single `import` of a hook
 * here would pull React into every one of them (and into the generated
 * service-worker bundle, where `scripts/build-sw-outbox.mjs` refuses to ship it).
 * The hook that renders this lives in `use-submission-receipt.ts`.
 */
export const SUBMISSION_RECEIPT_KEYS = {
  consultation: 'rr:receipt:consultation',
  training: 'rr:receipt:training',
  projectRequest: 'rr:receipt:project-request',
  retainer: 'rr:receipt:retainer',
  subscription: 'rr:receipt:subscription',
} as const;

export type SubmissionKind = keyof typeof SUBMISSION_RECEIPT_KEYS;

/**
 * The forms whose receipt belongs to the account that submitted it, because the
 * request itself does (`subscription_requests.user_id`). Every other form is
 * anonymous and keeps the one device-wide key.
 */
const ACCOUNT_SCOPED_KINDS: ReadonlySet<SubmissionKind> = new Set(['subscription']);

/**
 * The `localStorage` key a receipt lives under. An account-scoped kind appends
 * the account id, so signing in as someone else on the same device cannot show
 * the previous account's reference code (#1084).
 */
export function submissionReceiptKey(kind: SubmissionKind, accountId?: string | null): string {
  const key = SUBMISSION_RECEIPT_KEYS[kind];
  return accountId && ACCOUNT_SCOPED_KINDS.has(kind) ? `${key}:${accountId}` : key;
}

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

export interface SubmissionReceiptEventDetail {
  kind: SubmissionKind;
  code: string;
  /** The account the receipt belongs to; `null` for an anonymous form. */
  accountId: string | null;
}

function emitSubmissionReceipt(kind: SubmissionKind, code: string, accountId: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SubmissionReceiptEventDetail>(SUBMISSION_RECEIPT_EVENT, {
      detail: { kind, code, accountId },
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

export function readSubmissionReceipt(
  kind: SubmissionKind,
  accountId?: string | null
): string | null {
  const store = storage();
  if (!store) return null;

  const key = submissionReceiptKey(kind, accountId);
  try {
    const raw = store.getItem(key);
    if (!raw) {
      // An account-scoped read also retires the old device-wide subscription
      // receipt: it names no account, so it cannot be attributed to this one
      // and must never be shown to whoever signed in next (#1084).
      if (accountId && key !== SUBMISSION_RECEIPT_KEYS[kind]) {
        store.removeItem(SUBMISSION_RECEIPT_KEYS[kind]);
      }
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredReceipt>;
    const code = typeof parsed?.code === 'string' ? parsed.code : null;
    const at = typeof parsed?.at === 'number' ? parsed.at : null;

    if (code === null || at === null || Date.now() - at > RECEIPT_TTL_MS) {
      // Unparseable, older-shaped or expired: unusable, so drop it rather than
      // leave dead state on the device.
      store.removeItem(key);
      return null;
    }

    return code;
  } catch {
    // A malformed row throws on parse; clear it and report nothing.
    try {
      store.removeItem(key);
    } catch {
      // Storage may be read-only; nothing more to do.
    }
    return null;
  }
}

export function writeSubmissionReceipt(
  kind: SubmissionKind,
  referenceCode: string,
  accountId?: string | null
): void {
  try {
    const payload: StoredReceipt = { code: referenceCode, at: Date.now() };
    storage()?.setItem(submissionReceiptKey(kind, accountId), JSON.stringify(payload));
  } catch {
    // A full or unavailable store only costs the persistence fallback, never the submit.
  }
  emitSubmissionReceipt(kind, referenceCode, accountId ?? null);
}

export function clearSubmissionReceipt(kind: SubmissionKind, accountId?: string | null): void {
  try {
    storage()?.removeItem(submissionReceiptKey(kind, accountId));
  } catch {
    // Nothing to do.
  }
}
