import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  flushOutbox,
  OUTBOX_SYNC_TAG,
  readShellLastFlush,
  requestOutboxFlush,
  requestShellFlush,
} from '@/frontend/shared/local-store/background-sync';
import { requestDeviceWake } from '@/frontend/shared/local-store/device-wake';
import type { SyncEngine, SyncStatus } from '@/frontend/shared/local-store/sync-engine';

// The wake is a request of its own (ADR-0060); what this file owes is the
// *decision* to ask for it, so the requester is mocked and the real one is
// covered by `device-wake.test.ts`.
vi.mock('@/frontend/shared/local-store/device-wake', () => ({
  requestDeviceWake: vi.fn(),
}));

function registration(sync: { register: (tag: string) => Promise<void> } | undefined) {
  return { sync } as unknown as ServiceWorkerRegistration;
}

function container(
  found: ServiceWorkerRegistration | undefined,
  ready: Promise<ServiceWorkerRegistration> = new Promise<ServiceWorkerRegistration>(() => {})
) {
  return {
    getRegistration: vi.fn().mockResolvedValue(found),
    ready,
  } as unknown as ServiceWorkerContainer;
}

function engine(status: Partial<SyncStatus>) {
  return {
    flush: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue({
      syncing: false,
      pending: 0,
      failed: 0,
      lastError: null,
      lastFailedType: null,
      ...status,
    }),
  } as unknown as SyncEngine;
}

/** Lets `flushOutbox`'s fire-and-forget chain settle. */
async function settle() {
  for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 10));
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('requestOutboxFlush', () => {
  it('does nothing where there is no service worker container', async () => {
    await expect(requestOutboxFlush(undefined)).resolves.toBe(false);
  });

  it('does nothing on a browser without SyncManager', async () => {
    // Safari and Firefox: in-page triggers are the whole story there (ADR-0058).
    await expect(requestOutboxFlush(container(registration(undefined)))).resolves.toBe(false);
  });

  it('registers the tag on the active registration', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const found = registration({ register });

    await expect(requestOutboxFlush(container(found))).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith(OUTBOX_SYNC_TAG);
  });

  it('waits for a registration that has not landed yet', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const ready = Promise.resolve(registration({ register }));
    const containerWithout = container(undefined, ready);

    await expect(requestOutboxFlush(containerWithout)).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith(OUTBOX_SYNC_TAG);
  });

  it('gives up rather than hang when nothing ever registers', async () => {
    vi.useFakeTimers();
    const register = vi.fn().mockResolvedValue(undefined);

    const pending = requestOutboxFlush(container(undefined));
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('reports false when the registration is refused', async () => {
    const found = registration({ register: vi.fn().mockRejectedValue(new Error('refused')) });

    await expect(requestOutboxFlush(container(found))).resolves.toBe(false);
  });
});

describe('flushOutbox', () => {
  it('does nothing without an engine', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const containerWithSync = container(registration({ register }));
    vi.stubGlobal('navigator', { serviceWorker: containerWithSync });

    flushOutbox(null);
    await settle();

    expect(register).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('asks the browser to wake the worker when intents are still queued', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: container(registration({ register })) });
    const syncing = engine({ pending: 2 });

    flushOutbox(syncing);
    await settle();

    expect(syncing.flush).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(OUTBOX_SYNC_TAG);
    vi.unstubAllGlobals();
  });

  it('does not wake the worker for a queue the page emptied', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: container(registration({ register })) });
    const settled = engine({ pending: 0 });

    flushOutbox(settled);
    await settle();

    expect(settled.flush).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('still asks for a wake when the flush itself threw', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: container(registration({ register })) });
    const failing = engine({ pending: 1 });
    (failing.flush as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('inflight'));

    flushOutbox(failing);
    await settle();

    expect(register).toHaveBeenCalledWith(OUTBOX_SYNC_TAG);
    vi.unstubAllGlobals();
  });

  it('tells the account’s other devices when the flush delivered something', async () => {
    vi.stubGlobal('navigator', { serviceWorker: container(registration(undefined)) });
    const delivering = engine({ pending: 2 });
    (delivering.status as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        syncing: false,
        pending: 2,
        failed: 0,
        lastError: null,
        lastFailedType: null,
      })
      .mockResolvedValueOnce({
        syncing: false,
        pending: 0,
        failed: 0,
        lastError: null,
        lastFailedType: null,
      });

    flushOutbox(delivering);
    await settle();

    expect(requestDeviceWake).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('does not wake anyone for a flush that delivered nothing', async () => {
    vi.stubGlobal('navigator', { serviceWorker: container(registration(undefined)) });
    const settled = engine({ pending: 0 });

    flushOutbox(settled);
    await settle();

    expect(requestDeviceWake).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('requestShellFlush', () => {
  it('does nothing in a browser, which has no shell to ask', () => {
    expect(requestShellFlush()).toBe(false);
  });

  it('asks the shell to schedule its drain', () => {
    const schedule = vi.fn();
    vi.stubGlobal('RoyShellSync', { schedule });

    expect(requestShellFlush()).toBe(true);
    expect(schedule).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('reports false rather than throwing when the bridge refuses', () => {
    vi.stubGlobal('RoyShellSync', {
      schedule: () => {
        throw new Error('no scheduler');
      },
    });

    expect(requestShellFlush()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('wakes the shell from flushOutbox when intents are still queued', async () => {
    // The Android shell cannot rely on Background Sync (ADR-0059): nothing fires
    // with the app closed, so the page has to hand the queue to the shell.
    const schedule = vi.fn();
    vi.stubGlobal('RoyShellSync', { schedule });
    vi.stubGlobal('navigator', {
      serviceWorker: container(registration(undefined)),
    });
    const queued = engine({ pending: 1 });

    flushOutbox(queued);
    await settle();

    expect(queued.flush).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('leaves the shell alone when the page emptied the queue', async () => {
    const schedule = vi.fn();
    vi.stubGlobal('RoyShellSync', { schedule });
    vi.stubGlobal('navigator', {
      serviceWorker: container(registration(undefined)),
    });
    const settled = engine({ pending: 0 });

    flushOutbox(settled);
    await settle();

    expect(schedule).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('readShellLastFlush', () => {
  it('answers null in a browser, which has no shell and no record', () => {
    expect(readShellLastFlush()).toBe(null);
  });

  it('answers null where the bridge does not carry the method', () => {
    // An older shell injected before #455: the tier stays out entirely.
    vi.stubGlobal('RoyShellSync', { schedule: () => {} });
    expect(readShellLastFlush()).toBe(null);
    vi.unstubAllGlobals();
  });

  it('reads the record the shell persisted, field for field', () => {
    const record = {
      at: 1_760_000_000_000,
      delivered: 3,
      left: 1,
      pulled: 4,
      error: null,
    };
    vi.stubGlobal('RoyShellSync', { lastFlush: () => JSON.stringify(record) });

    expect(readShellLastFlush()).toEqual(record);
    vi.unstubAllGlobals();
  });

  it('keeps the error, and reads a missing pull as nothing pulled', () => {
    vi.stubGlobal('RoyShellSync', {
      lastFlush: () => JSON.stringify({ at: 1_760_000_000_000, delivered: 0, left: 0 }),
    });

    expect(readShellLastFlush()).toEqual({
      at: 1_760_000_000_000,
      delivered: 0,
      left: 0,
      pulled: 0,
      error: null,
    });
    vi.unstubAllGlobals();
  });

  it('answers null when there is no record to read', () => {
    // The Java method answers null over the bridge before there is a drain.
    vi.stubGlobal('RoyShellSync', { lastFlush: () => null });
    expect(readShellLastFlush()).toBe(null);
    vi.unstubAllGlobals();
  });

  it('answers null on anything unreadable, never a guess', () => {
    vi.stubGlobal('RoyShellSync', { lastFlush: () => '{{not json' });
    expect(readShellLastFlush()).toBe(null);
    vi.unstubAllGlobals();
  });

  it('answers null on a body that is not the record', () => {
    vi.stubGlobal('RoyShellSync', { lastFlush: () => JSON.stringify([]) });
    expect(readShellLastFlush()).toBe(null);
    vi.unstubAllGlobals();
  });

  it('answers null on a record missing the counts it claims', () => {
    vi.stubGlobal('RoyShellSync', {
      lastFlush: () => JSON.stringify({ at: 1_760_000_000_000 }),
    });
    expect(readShellLastFlush()).toBe(null);
    vi.unstubAllGlobals();
  });

  it('answers null when the bridge throws', () => {
    vi.stubGlobal('RoyShellSync', {
      lastFlush: () => {
        throw new Error('no persistence');
      },
    });
    expect(readShellLastFlush()).toBe(null);
    vi.unstubAllGlobals();
  });
});
