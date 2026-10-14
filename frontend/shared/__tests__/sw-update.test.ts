import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { watchWorkerUpdates, UPDATE_CHECK_INTERVAL_MS } from '@/frontend/shared/sw-update';

type Listener = () => void;

/**
 * A `ServiceWorkerContainer` stand-in: the module only reads `controller`,
 * registers listeners, and asks for the registration to `update()`.
 */
function createServiceWorkerFake(initialController: object | null = null) {
  const listeners = new Set<Listener>();
  const update = vi.fn(async () => undefined);
  const container = {
    controller: initialController,
    getRegistration: vi.fn(async () => ({ update })),
    addEventListener: (_type: string, listener: Listener) => void listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => void listeners.delete(listener),
  };

  return {
    container: container as unknown as ServiceWorkerContainer,
    update,
    getRegistration: container.getRegistration,
    setController: (next: object | null) => {
      container.controller = next;
    },
    swapTo: (next: object) => {
      container.controller = next;
      listeners.forEach((listener) => listener());
    },
    emitControllerChange: () => listeners.forEach((listener) => listener()),
    listenerCount: () => listeners.size,
  };
}

let visibility: DocumentVisibilityState;

/** Flushes the fake service worker's promise chain without advancing the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('watchWorkerUpdates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-checks for a new worker on focus and on the interval while visible', async () => {
    const sw = createServiceWorkerFake();
    const dispose = watchWorkerUpdates(sw.container, vi.fn());

    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(sw.update).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(sw.update).toHaveBeenCalledTimes(2);

    dispose();
  });

  it('never checks while the document is hidden', async () => {
    const sw = createServiceWorkerFake();
    const dispose = watchWorkerUpdates(sw.container, vi.fn());
    visibility = 'hidden';

    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 3);
    expect(sw.update).not.toHaveBeenCalled();

    dispose();
  });

  it('reloads once when a swapped worker takes control', () => {
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, reload);

    sw.swapTo({});
    expect(reload).toHaveBeenCalledTimes(1);

    // The reload already happened; a repeated event for the same worker is not
    // a second swap.
    sw.emitControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);

    dispose();
  });

  it('does not reload on the first install, when there was no controller', () => {
    const sw = createServiceWorkerFake(null);
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, reload);

    // `activate` calls `clients.claim()`, so the first worker also fires this.
    sw.swapTo({});
    expect(reload).not.toHaveBeenCalled();

    dispose();
  });

  it('does not reload when the controller goes away', () => {
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, reload);

    sw.setController(null);
    sw.emitControllerChange();
    expect(reload).not.toHaveBeenCalled();

    dispose();
  });

  it('holds a swap made in the background until the document is visible', () => {
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, reload);

    visibility = 'hidden';
    sw.swapTo({});
    expect(reload).not.toHaveBeenCalled();

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reload).toHaveBeenCalledTimes(1);

    dispose();
  });

  it('stops watching once disposed', async () => {
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, reload);

    dispose();
    expect(sw.listenerCount()).toBe(0);

    sw.swapTo({});
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(reload).not.toHaveBeenCalled();
    expect(sw.update).not.toHaveBeenCalled();
  });
});
