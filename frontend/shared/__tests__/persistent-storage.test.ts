import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestPersistentStorage } from '../persistent-storage';

const original = Object.getOwnPropertyDescriptor(navigator, 'storage');

function setStorage(value: unknown) {
  Object.defineProperty(navigator, 'storage', { value, configurable: true });
}

afterEach(() => {
  if (original) {
    Object.defineProperty(navigator, 'storage', original);
  } else {
    Reflect.deleteProperty(navigator, 'storage');
  }
});

describe('requestPersistentStorage', () => {
  it('returns false when the Storage API is unavailable', async () => {
    setStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('returns false when persist is not a function', async () => {
    setStorage({});
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('short-circuits when storage is already persisted', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persisted: vi.fn(async () => true), persist });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence when not yet persisted', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persisted: vi.fn(async () => false), persist });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('swallows a denial', async () => {
    setStorage({ persisted: vi.fn(async () => false), persist: vi.fn(async () => false) });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('swallows a thrown error', async () => {
    setStorage({
      persisted: vi.fn(async () => false),
      persist: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });
});
