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

/** When set, the transport's `send` parks on it, holding a flush open. */
let sendGate: Promise<void> | null = null;
const sentTypes: string[] = [];

vi.mock('@/frontend/api/leads/sync-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/leads/sync-transport')>();
  return {
    ...actual,
    createLeadHttpSyncTransport: () => ({
      send: async (entry: { type: string }) => {
        sentTypes.push(entry.type);
        if (sendGate) await sendGate;
      },
    }),
  };
});

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
    sendGate = null;
    sentTypes.length = 0;
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

  it('replays a failed online submission from the Outbox without waiting for a focus event', async () => {
    // `status` absent means the fetch threw before any HTTP status was seen.
    submitTrainingApplication.mockResolvedValue({ success: false, error: 'Failed to fetch' });

    const { result } = renderHook(() => useLeadSubmission());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit({ kind: 'training', value: VALUE });
    });

    // The submission is durably queued and reported as such to the caller, then
    // the queued write is itself a flush trigger — the replay does not wait for
    // the next focus event.
    expect(outcome).toEqual({ status: 'queued' });
    await waitFor(() => expect(sentTypes).toContain('training.submit'));

    const store = await LeadsLocalStore.open();
    await waitFor(async () => expect(await store.getOutbox()).toHaveLength(0));
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

  // The engine owns the channel now (#200); the hook's job is to dispose it.
  // Disposal is what stops a flush that lands after teardown from posting to a
  // closed channel — proven at the engine level in
  // `shared/local-store/__tests__/sync-engine.test.ts`.
  it('closes its broadcast channel when it unmounts', async () => {
    const closed: string[] = [];
    const originalClose = BroadcastChannel.prototype.close;
    BroadcastChannel.prototype.close = function (this: BroadcastChannel) {
      closed.push(this.name);
      return originalClose.call(this);
    };

    try {
      const { result, unmount } = renderHook(() => useLeadSubmission());
      await waitFor(() => expect(result.current.ready).toBe(true));

      unmount();

      expect(closed).toContain('leads-sync');
    } finally {
      BroadcastChannel.prototype.close = originalClose;
    }
  });

  // #204: the hook owns the store, so unmount closes it while the flush is
  // still parked inside `send`. The next store call must not reject on the
  // closed connection — the flush is cleanly abandoned and the intent stays
  // queued for the next mount to replay.
  it('abandons an in-flight flush without rejecting when it unmounts', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    const seeded = await LeadsLocalStore.open();
    await seeded.enqueue({
      entity: 'lead',
      type: 'training.submit',
      payload: { client_id: 'c-1' },
    });

    let releaseSend: () => void = () => {};
    sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });

    try {
      const { result, unmount } = renderHook(() => useLeadSubmission());
      await waitFor(() => expect(result.current.ready).toBe(true));
      // The flush has picked the intent up and is parked inside `send`.
      await waitFor(() => expect(result.current.syncing).toBe(true));

      unmount();
      releaseSend();

      // Give a rejection raised by the post-unmount store calls a tick to surface.
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      process.off('unhandledRejection', onRejection);
      seeded.close();
    }

    expect(rejections).toEqual([]);

    const store = await LeadsLocalStore.open();
    expect(await store.getOutbox()).toHaveLength(1);
    store.close();
  });
});
