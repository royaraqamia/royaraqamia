import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  applyWorkerUpdate,
  takeWaitingUpdateAtLoad,
  watchWorkerUpdates,
  UPDATE_APPLY_DEADLINE_MS,
  UPDATE_TAKE_GUARD_MS,
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
    /** An install the browser gave up on. */
    discarded: () => {
      state = 'redundant';
      listeners.forEach((listener) => listener());
    },
  };
}

/**
 * A `ServiceWorkerContainer` stand-in: the module only reads `controller`, asks
 * the registration to `update()`, and watches `waiting`/`installing`.
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

describe('takeWaitingUpdateAtLoad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('takes a build that is downloaded and waiting', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);
    const reload = vi.fn();

    const taken = await takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload });
    await flush();

    expect(taken).toBe(true);
    expect(worker.postMessage as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });
    // The swap does the reload, once, through `controllerchange`.
    expect(reload).not.toHaveBeenCalled();
  });

  it('asks the browser for a deploy before it decides', async () => {
    // The case the whole mechanism exists for: the deploy landed after this
    // document was cached, so the waiting worker appears *because* of the check
    // a load makes — the navigation's own check finishes too late to be seen.
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.update.mockImplementation(async () => {
      sw.registration.waiting = worker;
    });

    const taken = await takeWaitingUpdateAtLoad({
      serviceWorker: sw.container,
      reload: vi.fn(),
    });

    expect(sw.update).toHaveBeenCalledTimes(1);
    expect(taken).toBe(true);
  });

  it('takes the install that finishes while the document is loading', async () => {
    const { worker, installed } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.install(worker);

    const taking = takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() });
    await flush();
    expect(sw.registration.waiting).toBeNull();

    // The download the check started lands: the worker is now waiting.
    sw.registration.waiting = worker;
    installed();

    expect(await taking).toBe(true);
    expect(worker.postMessage as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('gives up on an install that outlives the deadline', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.install(worker);

    const taking = takeWaitingUpdateAtLoad({
      serviceWorker: sw.container,
      reload: vi.fn(),
      installDeadlineMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_001);

    expect(await taking).toBe(false);
    expect(worker.postMessage as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('leaves the document alone once the person has started using it', async () => {
    // A reload under someone mid-form is the thing this channel exists to avoid;
    // the build waits for the next load instead.
    const { worker, installed } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.install(worker);

    const taking = takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() });
    await flush();
    window.dispatchEvent(new Event('keydown'));

    sw.registration.waiting = worker;
    installed();

    expect(await taking).toBe(false);
    expect(worker.postMessage as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('never takes anything in a document nobody is looking at', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);
    visibility = 'hidden';

    const taken = await takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() });

    expect(taken).toBe(false);
  });

  it('does nothing on a first install, which is not an update', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake(null);
    sw.setWaiting(worker);

    const taken = await takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() });

    expect(taken).toBe(false);
    expect(worker.postMessage as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('stands down while the shell is announcing its own update', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);

    const taken = await takeWaitingUpdateAtLoad({
      serviceWorker: sw.container,
      reload: vi.fn(),
      isSuppressed: async () => true,
    });

    expect(taken).toBe(false);
    expect(worker.postMessage as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('still takes a waiting build when the check itself fails', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);
    sw.update.mockRejectedValue(new Error('offline'));

    const taken = await takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() });

    expect(taken).toBe(true);
  });

  it('refuses a second take inside the guard window', async () => {
    // The one thing standing between a worker that never activates and an
    // endless reload: the document that comes back must not try again at once.
    const first = createWorker();
    const sw = createServiceWorkerFake({});

    sw.setWaiting(first.worker);
    expect(await takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() })).toBe(
      true
    );

    const second = createWorker();
    sw.setWaiting(second.worker);
    expect(await takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() })).toBe(
      false
    );
    expect(second.worker.postMessage as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('takes again once the guard window has passed', async () => {
    const sw = createServiceWorkerFake({});
    const first = createWorker();
    sw.setWaiting(first.worker);
    expect(await takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() })).toBe(
      true
    );

    await vi.advanceTimersByTimeAsync(UPDATE_TAKE_GUARD_MS + 1);

    const second = createWorker();
    sw.setWaiting(second.worker);
    expect(await takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() })).toBe(
      true
    );
  });

  it('finds nothing to take when nothing is waiting', async () => {
    const sw = createServiceWorkerFake({});

    expect(await takeWaitingUpdateAtLoad({ serviceWorker: sw.container, reload: vi.fn() })).toBe(
      false
    );
  });
});

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

  it('installs no timer and no check of its own', async () => {
    // A document that is only sitting there is never moved (ADR-0134): the
    // watcher exists for swaps it did not start, and watching costs no requests.
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, { reload });

    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(sw.update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    dispose();
  });

  it('stops watching once disposed', async () => {
    const sw = createServiceWorkerFake({});
    const reload = vi.fn();
    const dispose = watchWorkerUpdates(sw.container, { reload });

    dispose();
    expect(sw.listenerCount()).toBe(0);

    sw.swapTo({});
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('applyWorkerUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('reloads anyway when the take never lands', async () => {
    // The worker the take named can be superseded in the moment between the probe
    // and the message, and a message to a worker that is no longer waiting
    // activates nothing and reports nothing. Without the deadline the document
    // would sit on the previous build with the update half-applied.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);
    const reload = vi.fn();

    await applyWorkerUpdate(sw.container, reload);
    expect(reload).not.toHaveBeenCalled();

    // No swap: the controller serving this document is still the same worker.
    await vi.advanceTimersByTimeAsync(UPDATE_APPLY_DEADLINE_MS);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('never landed');
    warn.mockRestore();
  });

  it('leaves a landed swap to do its own reloading', async () => {
    const { worker } = createWorker();
    const sw = createServiceWorkerFake({});
    sw.setWaiting(worker);
    const reload = vi.fn();

    await applyWorkerUpdate(sw.container, reload);
    // The swap: the controller this document is served by has changed.
    sw.swapTo({});
    await vi.advanceTimersByTimeAsync(UPDATE_APPLY_DEADLINE_MS);

    expect(reload).not.toHaveBeenCalled();
  });
});
