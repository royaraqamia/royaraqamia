import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearSubmissionReceipt,
  readSubmissionReceipt,
  RECEIPT_TTL_MS,
  SUBMISSION_RECEIPT_KEYS,
  writeSubmissionReceipt,
} from '../submission-receipt';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('submission receipts', () => {
  it('reads back what it wrote, per form kind', () => {
    writeSubmissionReceipt('training', 'TRN-2026-A7K2M9QX');

    expect(readSubmissionReceipt('training')).toBe('TRN-2026-A7K2M9QX');
    expect(readSubmissionReceipt('retainer')).toBeNull();
  });

  it('stores receipts in localStorage, not sessionStorage', () => {
    writeSubmissionReceipt('training', 'TRN-2026-A7K2M9QX');

    expect(window.localStorage.getItem(SUBMISSION_RECEIPT_KEYS.training)).toContain(
      'TRN-2026-A7K2M9QX'
    );
    expect(window.sessionStorage.getItem(SUBMISSION_RECEIPT_KEYS.training)).toBeNull();
  });

  it('clears a receipt', () => {
    writeSubmissionReceipt('retainer', 'RET-2026-A7K2M9QX');
    clearSubmissionReceipt('retainer');

    expect(readSubmissionReceipt('retainer')).toBeNull();
  });

  it('drops a receipt older than the TTL', () => {
    writeSubmissionReceipt('training', 'TRN-2026-A7K2M9QX');
    const fresh = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(fresh + RECEIPT_TTL_MS + 1);

    expect(readSubmissionReceipt('training')).toBeNull();
    expect(window.localStorage.getItem(SUBMISSION_RECEIPT_KEYS.training)).toBeNull();
  });

  it('keeps a receipt within the TTL', () => {
    writeSubmissionReceipt('training', 'TRN-2026-A7K2M9QX');
    const fresh = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(fresh + RECEIPT_TTL_MS - 1);

    expect(readSubmissionReceipt('training')).toBe('TRN-2026-A7K2M9QX');
  });

  it('drops a row written in an older shape instead of guessing', () => {
    window.localStorage.setItem(SUBMISSION_RECEIPT_KEYS.training, 'TRN-2026-RAW-STRING');

    expect(readSubmissionReceipt('training')).toBeNull();
    expect(window.localStorage.getItem(SUBMISSION_RECEIPT_KEYS.training)).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const spy = vi
      .spyOn(window, 'localStorage', 'get')
      .mockReturnValue(blocked as unknown as Storage);

    try {
      expect(() => writeSubmissionReceipt('consultation', 'CONS-2026-X')).not.toThrow();
      expect(readSubmissionReceipt('consultation')).toBeNull();
      expect(() => clearSubmissionReceipt('consultation')).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

// #1084: one browser, two accounts. The subscription receipt must never travel
// from the member who submitted to the next one who signs in.
describe('account-scoped receipts', () => {
  it('keeps the subscription receipt under the submitting account', () => {
    writeSubmissionReceipt('subscription', 'SUB-2026-A7K2M9QX', 'user-a');

    expect(readSubmissionReceipt('subscription', 'user-a')).toBe('SUB-2026-A7K2M9QX');
    expect(readSubmissionReceipt('subscription', 'user-b')).toBeNull();
    expect(window.localStorage.getItem('rr:receipt:subscription:user-a')).toContain(
      'SUB-2026-A7K2M9QX'
    );
  });

  it('clears only the account it was asked about', () => {
    writeSubmissionReceipt('subscription', 'SUB-2026-A', 'user-a');
    writeSubmissionReceipt('subscription', 'SUB-2026-B', 'user-b');

    clearSubmissionReceipt('subscription', 'user-a');

    expect(readSubmissionReceipt('subscription', 'user-a')).toBeNull();
    expect(readSubmissionReceipt('subscription', 'user-b')).toBe('SUB-2026-B');
  });

  it('leaves the anonymous forms device-wide even when an account is named', () => {
    writeSubmissionReceipt('training', 'TRN-2026-A7K2M9QX', 'user-a');

    expect(readSubmissionReceipt('training')).toBe('TRN-2026-A7K2M9QX');
    expect(readSubmissionReceipt('training', 'user-b')).toBe('TRN-2026-A7K2M9QX');
  });

  it('retires a legacy subscription receipt that names no account', () => {
    // Written before #1084, so it cannot be attributed to whoever is signed in.
    window.localStorage.setItem(
      SUBMISSION_RECEIPT_KEYS.subscription,
      JSON.stringify({ code: 'SUB-2026-LEGACY', at: Date.now() })
    );

    expect(readSubmissionReceipt('subscription', 'user-a')).toBeNull();
    expect(window.localStorage.getItem(SUBMISSION_RECEIPT_KEYS.subscription)).toBeNull();
  });
});
