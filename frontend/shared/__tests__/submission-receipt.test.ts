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
