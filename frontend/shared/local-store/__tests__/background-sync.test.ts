import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  flushOutbox,
  OUTBOX_SYNC_TAG,
  requestOutboxFlush,
} from '@/frontend/shared/local-store/background-sync';
import type { SyncEngine, SyncStatus } from '@/frontend/shared/local-store/sync-engine';

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
});
