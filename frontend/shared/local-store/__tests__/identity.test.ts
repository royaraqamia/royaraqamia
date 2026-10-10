import { describe, it, expect } from 'vitest';
import {
  GUEST_IDENTITY,
  identityFromUser,
  localStoreName,
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
});
