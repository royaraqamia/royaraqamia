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

import { createMcpBridgeSessionMinter } from '../bridge-session';

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
