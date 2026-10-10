import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { submitTrainingApplication } = vi.hoisted(() => ({
  submitTrainingApplication: vi.fn(),
}));

vi.mock('@/frontend/api/training', () => ({
  submitTrainingApplication,
  getOpenTrainingCohorts: vi.fn(),
}));

import { LeadsLocalStore } from '@/frontend/api/leads/local-store';
import { useLeadSubmission } from '@/frontend/state/leads/use-lead-submission';

const VALUE = {
  course_slug: 'build-digital-products' as const,
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963968478904',
  goal: 'أريد بناء متجر إلكتروني.',
  cohort_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
};

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('useLeadSubmission', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    submitTrainingApplication.mockReset();
    setOnline(true);
  });

  it('queues the submission in the Outbox offline without touching the network', async () => {
    setOnline(false);
    const { result } = renderHook(() => useLeadSubmission());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit({ kind: 'training', value: VALUE });
    });

    expect(outcome).toEqual({ status: 'queued' });
    expect(submitTrainingApplication).not.toHaveBeenCalled();

    const store = await LeadsLocalStore.open();
    const outbox = await store.getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.type).toBe('training.submit');
    expect(outbox[0]?.payload).toMatchObject({ course_slug: 'build-digital-products' });
    expect(typeof (outbox[0]?.payload as { client_id?: string }).client_id).toBe('string');
    store.close();
  });

  it('submits straight to the server when online and returns the Reference Code', async () => {
    submitTrainingApplication.mockResolvedValue({
      success: true,
      referenceCode: 'TRN-2026-A7K2M9QX',
    });

    const { result } = renderHook(() => useLeadSubmission());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit({ kind: 'training', value: VALUE });
    });

    expect(outcome).toEqual({ status: 'sent', referenceCode: 'TRN-2026-A7K2M9QX' });
    expect(submitTrainingApplication).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: expect.any(String) })
    );
  });

  it('queues rather than losing the submission when the request never reaches the server', async () => {
    // `status` absent means the fetch threw before any HTTP status was seen.
    submitTrainingApplication.mockResolvedValue({ success: false, error: 'Failed to fetch' });

    const { result } = renderHook(() => useLeadSubmission());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit({ kind: 'training', value: VALUE });
    });

    expect(outcome).toEqual({ status: 'queued' });
    const store = await LeadsLocalStore.open();
    expect(await store.getOutbox()).toHaveLength(1);
    store.close();
  });

  it('surfaces a server rejection instead of queueing it', async () => {
    submitTrainingApplication.mockResolvedValue({
      success: false,
      error: 'التقديم متوقف.',
      status: 400,
    });

    const { result } = renderHook(() => useLeadSubmission());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit({ kind: 'training', value: VALUE });
    });

    expect(outcome).toEqual({ status: 'error', error: 'التقديم متوقف.' });
    const store = await LeadsLocalStore.open();
    expect(await store.getOutbox()).toHaveLength(0);
    store.close();
  });
});
