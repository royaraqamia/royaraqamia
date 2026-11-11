import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  readSubmissionReceipt,
  SUBMISSION_RECEIPT_EVENT,
  writeSubmissionReceipt,
} from '@/frontend/shared/submission-receipt';
import { useSubmissionReceipt } from '@/frontend/shared/use-submission-receipt';

afterEach(() => {
  window.localStorage.clear();
});

describe('useSubmissionReceipt', () => {
  it('restores a remembered code after mount', () => {
    writeSubmissionReceipt('projectRequest', 'PRJ-2026-A7K2M9QX');

    const { result } = renderHook(() => useSubmissionReceipt('projectRequest'));

    expect(result.current.referenceCode).toBe('PRJ-2026-A7K2M9QX');
  });

  it('remembers and dismisses a code', () => {
    const { result } = renderHook(() => useSubmissionReceipt('training'));

    act(() => result.current.remember('TRN-2026-A7K2M9QX'));
    expect(result.current.referenceCode).toBe('TRN-2026-A7K2M9QX');
    expect(readSubmissionReceipt('training')).toBe('TRN-2026-A7K2M9QX');

    act(() => result.current.dismiss());
    expect(result.current.referenceCode).toBeNull();
    expect(readSubmissionReceipt('training')).toBeNull();
  });
});

// #1084: the subscription receipt belongs to the account that submitted it.
describe('useSubmissionReceipt, per account', () => {
  it('restores only the current account’s code', () => {
    writeSubmissionReceipt('subscription', 'SUB-2026-ACCOUNT-A', 'user-a');

    const a = renderHook(() => useSubmissionReceipt('subscription', 'user-a'));
    const b = renderHook(() => useSubmissionReceipt('subscription', 'user-b'));

    expect(a.result.current.referenceCode).toBe('SUB-2026-ACCOUNT-A');
    expect(b.result.current.referenceCode).toBeNull();
  });

  it('ignores a receipt announced for another account', () => {
    const { result } = renderHook(() => useSubmissionReceipt('subscription', 'user-b'));

    act(() => {
      window.dispatchEvent(
        new CustomEvent(SUBMISSION_RECEIPT_EVENT, {
          detail: { kind: 'subscription', code: 'SUB-2026-ACCOUNT-A', accountId: 'user-a' },
        })
      );
    });

    expect(result.current.referenceCode).toBeNull();
  });
});
