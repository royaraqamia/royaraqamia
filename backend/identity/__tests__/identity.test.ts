import { describe, it, expect, vi } from 'vitest';
import {
  createAdminIdentityReader,
  createBearerIdentityReader,
  createCookieSessionIdentityReader,
  createIdentityModule,
  type SessionIdentityReader,
} from '@/backend/identity';

function sessionReader(overrides: Partial<SessionIdentityReader> = {}): SessionIdentityReader {
  return {
    read: vi.fn().mockResolvedValue({ user: null, client: null }),
    readOptional: vi.fn().mockResolvedValue({ user: null, client: null }),
    ...overrides,
  };
}

describe('cookie session identity reader', () => {
  it('skips the client and the network round-trip when there is no session cookie', async () => {
    const createClient = vi.fn();
    const reader = createCookieSessionIdentityReader({
      getCookies: async () => ({ getAll: () => [{ name: 'theme', value: 'dark' }] }),
      createClient,
    });

    await expect(reader.readOptional()).resolves.toEqual({ user: null, client: null });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('recognises a chunked session cookie and resolves the user', async () => {
    const createClient = vi.fn().mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: 'a@b.com' } } }) },
    });
    const reader = createCookieSessionIdentityReader({
      getCookies: async () => ({
        getAll: () => [
          { name: 'sb-test-ref-auth-token.0', value: 'x' },
          { name: 'sb-test-ref-auth-token.1', value: 'y' },
        ],
      }),
      createClient,
    });

    await expect(reader.readOptional()).resolves.toEqual({
      user: { id: 'u-1', email: 'a@b.com' },
      client: expect.anything(),
    });
  });

  it('resolves the session identity regardless of the cookie check on `read`', async () => {
    const createClient = vi.fn().mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u-2', email: null } } }) },
    });
    const reader = createCookieSessionIdentityReader({
      getCookies: async () => ({ getAll: () => [] }),
      createClient,
    });

    await expect(reader.read()).resolves.toEqual({
      user: { id: 'u-2', email: undefined },
      client: expect.anything(),
    });
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('never throws from the optional path', async () => {
    const reader = createCookieSessionIdentityReader({
      getCookies: async () => {
        throw new Error('cookies unavailable');
      },
      createClient: vi.fn(),
    });

    await expect(reader.readOptional()).resolves.toEqual({ user: null, client: null });
  });
});

describe('bearer identity reader', () => {
  it('resolves a valid token through the injected public client', async () => {
    const getUser = vi.fn().mockResolvedValue({ user: { id: 'u-3', email: 'c@d.com' } });
    const reader = createBearerIdentityReader({ getUser });

    await expect(reader.read('Bearer token')).resolves.toEqual({ id: 'u-3', email: 'c@d.com' });
    expect(getUser).toHaveBeenCalledWith('token');
  });

  it('returns null without a bearer prefix or an empty token', async () => {
    const getUser = vi.fn();
    const reader = createBearerIdentityReader({ getUser });

    await expect(reader.read(null)).resolves.toBeNull();
    await expect(reader.read('Basic abc')).resolves.toBeNull();
    await expect(reader.read('Bearer ')).resolves.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('returns null when the token is rejected, without throwing', async () => {
    const onError = vi.fn();
    const reader = createBearerIdentityReader({
      getUser: vi.fn().mockRejectedValue(new Error('expired')),
      onError,
    });

    await expect(reader.read('Bearer stale')).resolves.toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('admin identity reader', () => {
  const identity = { user: { id: 'u-1', email: 'admin@example.com' }, client: null };

  it('returns anonymous for no session and never applies the allowlist', async () => {
    const isAdmin = vi.fn();
    const reader = createAdminIdentityReader({
      session: sessionReader(),
      isAdmin,
    });

    await expect(reader.read()).resolves.toEqual({ kind: 'anonymous' });
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it('returns forbidden for a session whose email is not on the allowlist', async () => {
    const reader = createAdminIdentityReader({
      session: sessionReader({
        read: vi.fn().mockResolvedValue({
          user: { id: 'u-2', email: 'user@example.com' },
          client: null,
        }),
      }),
      isAdmin: () => false,
    });

    await expect(reader.read()).resolves.toEqual({ kind: 'forbidden' });
  });

  it('returns the admin identity and runs the side effect for an allowlisted session', async () => {
    const onAdmin = vi.fn().mockResolvedValue(undefined);
    const reader = createAdminIdentityReader({
      session: sessionReader({ read: vi.fn().mockResolvedValue(identity) }),
      isAdmin: () => true,
      onAdmin,
    });

    await expect(reader.read()).resolves.toEqual({ kind: 'admin', identity });
    expect(onAdmin).toHaveBeenCalledTimes(1);
  });
});

describe('identity module', () => {
  it('exposes the three outcomes behind one interface', async () => {
    const session = sessionReader({
      read: vi.fn().mockResolvedValue({ user: { id: 'u-1', email: 'a@b.com' }, client: null }),
    });
    const admin = { read: vi.fn().mockResolvedValue({ kind: 'forbidden' as const }) };
    const module = createIdentityModule(session, admin);

    await expect(module.resolveSession()).resolves.toEqual({
      user: { id: 'u-1', email: 'a@b.com' },
      client: null,
    });
    await expect(module.resolveOptional()).resolves.toEqual({ user: null, client: null });
    await expect(module.resolveAdmin()).resolves.toEqual({ kind: 'forbidden' });
  });
});
