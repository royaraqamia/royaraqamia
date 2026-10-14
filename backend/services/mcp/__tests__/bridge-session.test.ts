import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateLink = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock('@/backend/config/supabase', () => ({
  getAdminSupabase: () => ({ auth: { admin: { generateLink: mockGenerateLink } } }),
}));

vi.mock('@/backend/config/env', () => ({
  env: {
    supabaseUrl: 'https://test.supabase.co',
    supabasePublishableKey: 'test-key',
  },
}));

vi.mock('@/backend/shared/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createMcpBridgeSessionMinter, createMcpBridgeSessionRevoker } from '../bridge-session';

const publicClient = { auth: { verifyOtp: mockVerifyOtp } };

function minter() {
  return createMcpBridgeSessionMinter({ publicClient: publicClient as never });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateLink.mockResolvedValue({
    data: { properties: { hashed_token: 'hashed-otp' } },
    error: null,
  });
  mockVerifyOtp.mockResolvedValue({
    data: { session: { refresh_token: 'bridge-refresh-token' } },
    error: null,
  });
});

describe('createMcpBridgeSessionMinter', () => {
  it('mints a dedicated session and returns only its refresh token', async () => {
    await expect(minter().mint('user@example.com')).resolves.toEqual({
      refreshToken: 'bridge-refresh-token',
    });

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'user@example.com',
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: 'hashed-otp',
    });
  });

  it('returns null without touching Supabase when there is no email', async () => {
    await expect(minter().mint('')).resolves.toBeNull();
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('returns null when no OTP can be generated', async () => {
    mockGenerateLink.mockResolvedValue({ data: { properties: {} }, error: { message: 'nope' } });

    await expect(minter().mint('user@example.com')).resolves.toBeNull();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('returns null when verification yields no session', async () => {
    mockVerifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } });

    await expect(minter().mint('user@example.com')).resolves.toBeNull();
  });

  it('returns null instead of throwing when Supabase fails', async () => {
    mockGenerateLink.mockRejectedValue(new Error('network'));

    await expect(minter().mint('user@example.com')).resolves.toBeNull();
  });
});

/**
 * The sign-out side of a *live* revoke: the grant's own session is refreshed into
 * an access token and that one session is logged out. Scope `local` is the whole
 * point — `global` would revoke the user's browser session too.
 */
const mockRefreshSession = vi.fn();
const mockSignOut = vi.fn();

const revokeClient = { auth: { refreshSession: mockRefreshSession, signOut: mockSignOut } };

function revoker() {
  return createMcpBridgeSessionRevoker({ publicClient: revokeClient as never });
}

describe('createMcpBridgeSessionRevoker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'fresh-access-token' } },
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it('refreshes the bridge token, then signs out that session and only that one', async () => {
    await expect(revoker().revoke('bridge-refresh-token')).resolves.toBe(true);

    expect(mockRefreshSession).toHaveBeenCalledWith({ refresh_token: 'bridge-refresh-token' });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reports a session that was already gone without trying to sign it out', async () => {
    // Signed out, expired or superseded: nothing left to revoke, and GoTrue says
    // so with the same 400 the retirement paths key off.
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { code: 'refresh_token_not_found', message: 'Invalid Refresh Token' },
    });

    await expect(revoker().revoke('bridge-refresh-token')).resolves.toBe(false);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('reports a failed logout instead of throwing', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'GoTrue down' } });

    await expect(revoker().revoke('bridge-refresh-token')).resolves.toBe(false);
  });

  it('absorbs a network failure', async () => {
    mockRefreshSession.mockRejectedValue(new Error('fetch failed'));

    await expect(revoker().revoke('bridge-refresh-token')).resolves.toBe(false);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('does nothing without a refresh token to revive', async () => {
    await expect(revoker().revoke('')).resolves.toBe(false);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('does nothing when the deploy has no publishable key', async () => {
    const { env } = await import('@/backend/config/env');
    const original = env.supabasePublishableKey;
    (env as { supabasePublishableKey: string | undefined }).supabasePublishableKey = '';

    try {
      // A misconfiguration is not a session to revoke, and must not throw.
      await expect(createMcpBridgeSessionRevoker().revoke('bridge-refresh-token')).resolves.toBe(
        false
      );
      expect(mockRefreshSession).not.toHaveBeenCalled();
    } finally {
      (env as { supabasePublishableKey: string | undefined }).supabasePublishableKey = original;
    }
  });
});
