import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveLiteDevice,
  applyLiteClass,
  installLiteMode,
  getLiteModeScript,
  LITE_CLASS,
  LITE_ATTRIBUTE,
  LITE_STORAGE_KEY,
  MEMORY_TIERS,
  CORE_TIERS,
} from '@/frontend/shared/lite-mode';

describe('resolveLiteDevice', () => {
  it('is not lite on a capable device that has no reduction preference', () => {
    expect(
      resolveLiteDevice({
        reducedMotion: false,
        deviceMemory: 8,
        hardwareConcurrency: 8,
      })
    ).toBe(false);
  });

  it('is lite when the user prefers reduced motion, however capable the device', () => {
    expect(
      resolveLiteDevice({
        reducedMotion: true,
        deviceMemory: 32,
        hardwareConcurrency: 16,
      })
    ).toBe(true);
  });

  it('is lite when reported device memory is at or below the low-end tier', () => {
    expect(
      resolveLiteDevice({
        reducedMotion: false,
        deviceMemory: MEMORY_TIERS.lowEndGb,
        hardwareConcurrency: 8,
      })
    ).toBe(true);
  });

  it('is not lite when device memory sits just above the low-end tier', () => {
    expect(
      resolveLiteDevice({
        reducedMotion: false,
        deviceMemory: MEMORY_TIERS.lowEndGb + 1,
        hardwareConcurrency: 8,
      })
    ).toBe(false);
  });

  it('is lite when reported core count is at or below the low-end tier', () => {
    expect(
      resolveLiteDevice({
        reducedMotion: false,
        deviceMemory: 8,
        hardwareConcurrency: CORE_TIERS.lowEnd,
      })
    ).toBe(true);
  });

  it('is not lite when core count sits just above the low-end tier', () => {
    expect(
      resolveLiteDevice({
        reducedMotion: false,
        deviceMemory: 8,
        hardwareConcurrency: CORE_TIERS.lowEnd + 1,
      })
    ).toBe(false);
  });

  it('ignores absent signals rather than guessing', () => {
    expect(resolveLiteDevice({ reducedMotion: false })).toBe(false);
  });
});

describe('applyLiteClass', () => {
  it('marks the element when the device is lite', () => {
    const el = document.createElement('html');
    applyLiteClass(el, true);
    expect(el.classList.contains(LITE_CLASS)).toBe(true);
    expect(el.getAttribute(LITE_ATTRIBUTE)).toBe('true');
  });

  it('removes the mark when the device is not lite', () => {
    const el = document.createElement('html');
    applyLiteClass(el, true);
    applyLiteClass(el, false);
    expect(el.classList.contains(LITE_CLASS)).toBe(false);
    expect(el.hasAttribute(LITE_ATTRIBUTE)).toBe(false);
  });

  it('is idempotent', () => {
    const el = document.createElement('html');
    applyLiteClass(el, true);
    applyLiteClass(el, true);
    expect(el.classList.contains(LITE_CLASS)).toBe(true);
    expect(el.getAttribute(LITE_ATTRIBUTE)).toBe('true');
  });
});

describe('installLiteMode', () => {
  afterEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute(LITE_ATTRIBUTE);
    window.localStorage.clear();
  });

  it('marks the document on a low-end device', () => {
    const cleanup = installLiteMode(document.documentElement, {
      reducedMotion: false,
      deviceMemory: 2,
      hardwareConcurrency: 2,
    });
    expect(document.documentElement.classList.contains(LITE_CLASS)).toBe(true);
    cleanup();
  });

  it('persists the verdict for other code to read', () => {
    const cleanup = installLiteMode(document.documentElement, {
      reducedMotion: false,
      deviceMemory: 2,
      hardwareConcurrency: 2,
      storage: window.localStorage,
    });
    expect(window.localStorage.getItem(LITE_STORAGE_KEY)).toBe('true');
    cleanup();
  });

  it('re-decides from live signals on a later run, ignoring a stored "false"', () => {
    // A previous visit on capable hardware wrote "false". That memo must not
    // freeze the decision: a device that now prefers reduced motion is lite
    // regardless of what we persisted last time.
    window.localStorage.setItem(LITE_STORAGE_KEY, 'false');

    const cleanup = installLiteMode(document.documentElement, {
      reducedMotion: true,
      deviceMemory: 16,
      hardwareConcurrency: 16,
      storage: window.localStorage,
    });
    expect(document.documentElement.classList.contains(LITE_CLASS)).toBe(true);
    cleanup();
    expect(window.localStorage.getItem(LITE_STORAGE_KEY)).toBe('true');
  });

  it('honours an explicit override, which outranks the live signals', () => {
    const cleanup = installLiteMode(document.documentElement, {
      reducedMotion: false,
      deviceMemory: 16,
      hardwareConcurrency: 16,
      // A manual "always lite" choice, as a future toggle would pass it.
      override: true,
    });
    expect(document.documentElement.classList.contains(LITE_CLASS)).toBe(true);
    cleanup();
  });

  it('does not mark the document on a capable device', () => {
    const cleanup = installLiteMode(document.documentElement, {
      reducedMotion: false,
      deviceMemory: 16,
      hardwareConcurrency: 16,
    });
    expect(document.documentElement.classList.contains(LITE_CLASS)).toBe(false);
    cleanup();
  });

  it('unsubscribes from the motion query on cleanup', () => {
    const listeners = new Set<EventListener>();
    const query: Partial<MediaQueryList> & { matches: boolean } = {
      matches: false,
      addEventListener: (_: string, listener: EventListenerOrEventListenerObject) => {
        listeners.add(listener as EventListener);
      },
      removeEventListener: (_: string, listener: EventListenerOrEventListenerObject) => {
        listeners.delete(listener as EventListener);
      },
    };
    const cleanup = installLiteMode(document.documentElement, {
      reducedMotion: false,
      deviceMemory: 16,
      hardwareConcurrency: 16,
      matchMedia: () => query,
    });
    expect(listeners.size).toBe(1);
    cleanup();
    expect(listeners.size).toBe(0);
  });
});

describe('getLiteModeScript', () => {
  function runScript(
    script: string,
    fakeDocument: { documentElement: Element },
    fakeWindow: Record<string, unknown>,
    fakeNavigator: Record<string, unknown> = { deviceMemory: 8, hardwareConcurrency: 8 }
  ) {
    // The emitted script is a self-invoking function; give it a scope holding
    // the globals the pre-paint environment would have.
    const factory = new Function('document', 'window', 'navigator', `with(this){${script}}`);
    const scope = { document: fakeDocument, window: fakeWindow, navigator: fakeNavigator };
    factory.call(scope, fakeDocument, fakeWindow, fakeNavigator);
  }

  function capableWindow() {
    const storage = new Map<string, string>();
    return {
      storage,
      window: {
        matchMedia: () => ({ matches: false }),
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => void storage.set(key, value),
        },
      },
    };
  }

  it('returns a self-contained script that marks the document', () => {
    const script = getLiteModeScript();
    expect(script).toContain(LITE_CLASS);
    expect(script).toContain(LITE_STORAGE_KEY);

    const el = document.createElement('html');
    const { window: fakeWindow, storage } = capableWindow();
    runScript(script, { documentElement: el }, fakeWindow);

    // The fixture device is capable, so the script must leave it unmarked...
    expect(el.classList.contains(LITE_CLASS)).toBe(false);
    // ...but it still records the verdict for other code to read.
    expect(storage.get(LITE_STORAGE_KEY)).toBe('false');
  });

  it('marks the document when the script runs on a low-end device', () => {
    const el = document.createElement('html');
    const { window: fakeWindow } = capableWindow();
    runScript(getLiteModeScript(), { documentElement: el }, fakeWindow, { deviceMemory: 2 });

    expect(el.classList.contains(LITE_CLASS)).toBe(true);
    expect(el.getAttribute(LITE_ATTRIBUTE)).toBe('true');
  });

  it('re-decides from live signals, ignoring a stored verdict', () => {
    const el = document.createElement('html');
    const { window: fakeWindow, storage } = capableWindow();
    storage.set(LITE_STORAGE_KEY, 'false');

    runScript(getLiteModeScript(), { documentElement: el }, fakeWindow, { deviceMemory: 2 });

    expect(el.classList.contains(LITE_CLASS)).toBe(true);
  });

  it('does not throw when storage access is denied', () => {
    const el = document.createElement('html');
    const hostileWindow = {
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
      matchMedia: () => ({ matches: false }),
    };
    expect(() =>
      runScript(getLiteModeScript(), { documentElement: el }, hostileWindow)
    ).not.toThrow();
    expect(el.classList.contains(LITE_CLASS)).toBe(false);
  });

  it('carries the live tier thresholds rather than stale copies', () => {
    const script = getLiteModeScript();
    // The emitted rule rewrites its tier identifiers to literals; if the
    // constants move, the script must move with them.
    expect(script).toContain(`<= ${MEMORY_TIERS.lowEndGb}`);
    expect(script).toContain(`<= ${CORE_TIERS.lowEnd}`);
  });

  it('uses the live class and storage names', () => {
    const script = getLiteModeScript();
    expect(script).toContain(`'${LITE_CLASS}'`);
    expect(script).toContain(`'${LITE_ATTRIBUTE}'`);
    expect(script).toContain(`'${LITE_STORAGE_KEY}'`);
  });
});
