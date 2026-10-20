import { describe, expect, it, vi, afterEach } from 'vitest';
import { purgeServiceWorkerCaches } from '../cache-maintenance';

function reply(transfer: Transferable[]) {
  const port = transfer[0] as unknown as { postMessage: (value: unknown) => void };
  port.postMessage({ type: 'ACCOUNT_CACHES_PURGED' });
}

function worker(handler: (message: unknown, transfer: Transferable[]) => void) {
  return {
    postMessage: vi.fn((message: unknown, transfer: Transferable[]) => handler(message, transfer)),
  };
}

function container(active: ReturnType<typeof worker> | null, controller = active) {
  return {
    controller,
    ready: Promise.resolve({ active }),
  };
}

describe('purgeServiceWorkerCaches', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the controlling worker to purge and waits for its acknowledgement', async () => {
    const active = worker((message, transfer) => {
      expect(message).toEqual({ type: 'PURGE_ACCOUNT_CACHES' });
      reply(transfer);
    });

    await expect(purgeServiceWorkerCaches(container(active))).resolves.toBe(true);
    expect(active.postMessage).toHaveBeenCalledTimes(1);
  });

  it('falls back to the registration when no worker controls this document', async () => {
    const active = worker((_message, transfer) => {
      reply(transfer);
    });

    await expect(purgeServiceWorkerCaches(container(active, null))).resolves.toBe(true);
  });

  it('is a no-op when the origin has no active worker', async () => {
    await expect(purgeServiceWorkerCaches(container(null))).resolves.toBe(false);
    await expect(purgeServiceWorkerCaches(undefined)).resolves.toBe(false);
  });

  it('never delays sign-out on a worker that does not answer', async () => {
    vi.useFakeTimers();
    const active = worker(() => undefined);

    const result = purgeServiceWorkerCaches(container(active), 500);
    await vi.advanceTimersByTimeAsync(500);

    await expect(result).resolves.toBe(false);
  });

  it('never throws when posting to the worker fails', async () => {
    const active = {
      postMessage: vi.fn(() => {
        throw new Error('worker is gone');
      }),
    };

    await expect(purgeServiceWorkerCaches(container(active))).resolves.toBe(false);
  });
});
