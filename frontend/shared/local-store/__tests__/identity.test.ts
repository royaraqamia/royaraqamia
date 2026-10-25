import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GUEST_IDENTITY,
  clearPersistedIdentity,
  identityFromUser,
  identityUserId,
  localStoreName,
  persistIdentity,
  readPersistedIdentity,
  subscribeToPersistedIdentity,
  userIdentity,
} from '@/frontend/shared/local-store/identity';

describe('local store identity', () => {
  it('treats a missing user as the guest identity', () => {
    expect(identityFromUser(null)).toBe(GUEST_IDENTITY);
    expect(identityFromUser(undefined)).toBe(GUEST_IDENTITY);
    expect(identityFromUser({})).toBe(GUEST_IDENTITY);
    expect(identityFromUser({ id: '' })).toBe(GUEST_IDENTITY);
  });

  it('namespaces a signed-in user', () => {
    expect(identityFromUser({ id: 'abc' })).toBe('user:abc');
    expect(userIdentity('abc')).toBe('user:abc');
  });

  it('builds one database name per product and identity', () => {
    expect(localStoreName('habitflow', GUEST_IDENTITY)).toBe('habitflow__guest');
    expect(localStoreName('habitflow', userIdentity('abc'))).toBe('habitflow__user:abc');
  });

  it('reads the account id back out of an identity', () => {
    expect(identityUserId(userIdentity('abc'))).toBe('abc');
    expect(identityUserId(GUEST_IDENTITY)).toBeNull();
    // Round-trips whatever the id holds, an id that itself contains a colon included.
    expect(identityUserId(userIdentity(userIdentity('abc') as string))).toBe('user:abc');
  });
});

/**
 * The remembered identity is what lets a product root open the right Local
 * Store before the session resolves (#493). Its contract is small and it is
 * load-bearing: a wrong answer paints another account's rows.
 */
describe('the persisted identity', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('remembers nothing on a device that never resolved a session', () => {
    expect(readPersistedIdentity()).toBeNull();
  });

  it('round-trips each identity', () => {
    persistIdentity(userIdentity('abc'));
    expect(readPersistedIdentity()).toBe('user:abc');

    persistIdentity(GUEST_IDENTITY);
    expect(readPersistedIdentity()).toBe(GUEST_IDENTITY);
  });

  it('forgets on a sign-out', () => {
    persistIdentity(userIdentity('abc'));
    clearPersistedIdentity();

    expect(readPersistedIdentity()).toBeNull();
  });

  it('rejects a value that is not an identity', () => {
    window.localStorage.setItem('royaraqamia:local-identity', 'user:');
    expect(readPersistedIdentity()).toBeNull();

    window.localStorage.setItem('royaraqamia:local-identity', 'abc');
    expect(readPersistedIdentity()).toBeNull();
  });

  it('treats a storage that throws as "nothing remembered"', () => {
    const hostile: Storage = {
      length: 0,
      clear: vi.fn(),
      getItem: () => {
        throw new Error('private mode');
      },
      key: () => null,
      removeItem: vi.fn(),
      setItem: () => {
        throw new Error('private mode');
      },
    };

    expect(readPersistedIdentity(hostile)).toBeNull();
    expect(() => persistIdentity(userIdentity('abc'), hostile)).not.toThrow();
    expect(() => clearPersistedIdentity(hostile)).not.toThrow();
  });

  it('notifies the surfaces that paint from it', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPersistedIdentity(listener);

    persistIdentity(userIdentity('abc'));
    clearPersistedIdentity();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    persistIdentity(GUEST_IDENTITY);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
