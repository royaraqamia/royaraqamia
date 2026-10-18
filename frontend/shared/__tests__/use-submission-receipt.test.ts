import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  readSubmissionReceipt,
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
