import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  applyWorkerUpdate,
  watchWorkerUpdates,
  UPDATE_CHECK_INTERVAL_MS,
} from '@/frontend/shared/sw-update';

type Listener = () => void;

/** A worker the page can only observe: the state the browser would move it to. */
function createWorker() {
  const listeners = new Set<Listener>();
  let state: ServiceWorkerState = 'installing';

  const worker = {
    get state() {
      return state;
    },
    postMessage: vi.fn(),
    addEventListener: (_type: string, listener: Listener) => void listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => void listeners.delete(listener),
  };

  return {
    worker: worker as unknown as ServiceWorker,
    /** The browser reporting that the install finished. */
    installed: () => {
      state = 'installed';
      listeners.forEach((listener) => listener());
    },
  };
}

/**
 * A `ServiceWorkerContainer` stand-in: the module only reads `controller`, asks
 * for the registration to `update()`, and watches `waiting`/`installing`.
 */
function createServiceWorkerFake(initialController: object | null = null) {
  const listeners = new Set<Listener>();
  const update = vi.fn(async () => undefined);
  const registration = {
    update,
    waiting: null as ServiceWorker | null,
    installing: null as ServiceWorker | null,
  };
  const container = {
    controller: initialController,
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
    addEventListener: (_type: string, listener: Listener) => void listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => void listeners.delete(listener),
  };

  return {
    container: container as unknown as ServiceWorkerContainer,
    registration,
    update,
    setController: (next: object | null) => {
      container.controller = next;
    },
    setWaiting: (worker: ServiceWorker) => {
      registration.waiting = worker;
    },
    install: (worker: ServiceWorker) => {
      registration.installing = worker;
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
    const dispose = watchWorkerUpdates(sw.container, { reload: vi.fn() });

    // The initial check is part of the setup: a document that is opened and left
    // alone never fires focus, and an update waiting at load has to be announced.
    await flush();
    const baseline = sw.update.mock.calls.length;

    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(sw.update.mock.calls.length).toBe(baseline + 1);

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(sw.update.mock.calls.length).toBe(baseline + 2);

    dispose();
  });

  it('never checks while the document is hidden', async () => {
    const sw = createServiceWorkerFake();
    visibility = 'hidden';
    const dispose = watchWorkerUpdates(sw.container, { reload: vi.fn() });

    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 3);
    expect(sw.update).not.toHaveBeenCalled();

    dispose();
  });

  it('reloads once when a swapped worker takes control', () => {
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, { reload });

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
    const dispose = watchWorkerUpdates(sw.container, { reload });

    // `activate` calls `clients.claim()`, so the first worker also fires this.
    sw.swapTo({});
    expect(reload).not.toHaveBeenCalled();

    dispose();
  });

  it('does not reload when the controller goes away', () => {
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, { reload });

    sw.setController(null);
    sw.emitControllerChange();
    expect(reload).not.toHaveBeenCalled();

    dispose();
  });

  it('holds a swap made in the background until the document is visible', () => {
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, { reload });

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
    const onUpdateAvailable = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, { reload, onUpdateAvailable });

    dispose();
    expect(sw.listenerCount()).toBe(0);
    const settled = sw.update.mock.calls.length;

    sw.swapTo({});
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(reload).not.toHaveBeenCalled();
    expect(onUpdateAvailable).not.toHaveBeenCalled();
    expect(sw.update.mock.calls.length).toBe(settled);
  });

  it('announces a worker that was already waiting when the document loaded', async () => {
    // What a reload leaves behind: the previous refresh bumped into the update
    // and did not release it (ADR-0039).
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);
    const onUpdateAvailable = vi.fn();

    const dispose = watchWorkerUpdates(sw.container, { reload: vi.fn(), onUpdateAvailable });
    await flush();

    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
    expect(onUpdateAvailable).toHaveBeenCalledWith(true);

    dispose();
  });

  it('announces an update that finished installing after the check', async () => {
    const sw = createServiceWorkerFake({});
    const onUpdateAvailable = vi.fn();
    const { worker, installed } = createWorker();

    const dispose = watchWorkerUpdates(sw.container, { reload: vi.fn(), onUpdateAvailable });
    await flush();

    sw.install(worker);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(onUpdateAvailable).not.toHaveBeenCalled();

    // The install finishing is the browser's news, not the check's return value.
    sw.registration.waiting = worker;
    installed();
    await flush();

    expect(onUpdateAvailable).toHaveBeenCalledWith(true);

    dispose();
  });

  it('says so once, however many times it re-checks', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);
    const onUpdateAvailable = vi.fn();

    const dispose = watchWorkerUpdates(sw.container, { reload: vi.fn(), onUpdateAvailable });
    await flush();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    await flush();

    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);

    dispose();
  });

  it('does not announce anything on a first install, which is not an update', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake(null);
    // No controller means the document was never served by an older build, so
    // there is nothing to be behind.
    sw.setWaiting(worker);
    const onUpdateAvailable = vi.fn();

    const dispose = watchWorkerUpdates(sw.container, { reload: vi.fn(), onUpdateAvailable });
    await flush();

    expect(onUpdateAvailable).not.toHaveBeenCalled();

    dispose();
  });

  it('takes the announcement back when the waiting worker takes over', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);
    const onUpdateAvailable = vi.fn();
    const reload = vi.fn();

    const dispose = watchWorkerUpdates(sw.container, { reload, onUpdateAvailable });
    await flush();
    expect(onUpdateAvailable).toHaveBeenLastCalledWith(true);

    // The swap: the waiting worker is in control and the document is replaced.
    sw.registration.waiting = null;
    sw.swapTo({});
    expect(onUpdateAvailable).toHaveBeenLastCalledWith(false);
    expect(reload).toHaveBeenCalledTimes(1);

    dispose();
  });
});

describe('applyWorkerUpdate', () => {
  it('asks the waiting worker to take over, and leaves the reload to the swap', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);
    const reload = vi.fn();

    await applyWorkerUpdate(sw.container, reload);

    expect(worker.postMessage as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads when there is nothing to skip to', async () => {
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();

    await applyWorkerUpdate(sw.container, reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads when the registration cannot be read at all', async () => {
    const sw = createServiceWorkerFake({});
    (sw.container.getRegistration as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('offline')
    );
    const reload = vi.fn();

    await applyWorkerUpdate(sw.container, reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
