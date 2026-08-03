import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAdminSupabase = vi.fn();

vi.mock('@/backend/transport/supabase/admin', () => ({
  getAdminSupabase: () => mockGetAdminSupabase(),
}));

import { SupabaseOtpRepository } from '@/backend/repositories/otp/supabase-otp-repository';

interface OtpRecord {
  id: string;
  email: string;
  otp_hash: string;
  salt: string;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  verified_at: string | null;
}

function makeClient(
  overrides: {
    insertError?: Error | null;
    record?: OtpRecord | null;
    fetchError?: Error | null;
    updateError?: Error | null;
  } = {}
) {
  const insert = vi.fn().mockResolvedValue({ error: overrides.insertError ?? null });
  const updateEq = vi.fn().mockResolvedValue({ error: overrides.updateError ?? null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: overrides.record ?? null, error: overrides.fetchError ?? null });
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const order = vi.fn().mockReturnValue({ limit });
  const is = vi.fn().mockReturnValue({ order });
  const selectEq = vi.fn().mockReturnValue({ is });
  const select = vi.fn().mockReturnValue({ eq: selectEq });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table !== 'otp_codes') throw new Error(`unexpected table: ${table}`);
    return { insert, select, update };
  });

  const client = { from };
  mockGetAdminSupabase.mockReturnValue(client);
  return { client, insert, update, updateEq, maybeSingle, from, selectEq, is };
}

function makeRecord(overrides: Partial<OtpRecord> = {}): OtpRecord {
  return {
    id: 'otp-1',
    email: 'user@example.com',
    otp_hash: 'hash',
    salt: 'salt',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    attempts: 0,
    max_attempts: 5,
    verified_at: null,
    ...overrides,
  };
}

describe('SupabaseOtpRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOtpRecord', () => {
    it('inserts the OTP record with the given max_attempts', async () => {
      const { insert, from } = makeClient();
      const repo = new SupabaseOtpRepository();
      const expiresAt = new Date('2026-08-02T10:00:00.000Z');

      await repo.createOtpRecord({
        email: 'user@example.com',
        otpHash: 'hash123',
        salt: 'salt456',
        expiresAt,
        maxAttempts: 5,
      });

      expect(from).toHaveBeenCalledWith('otp_codes');
      expect(insert).toHaveBeenCalledWith({
        email: 'user@example.com',
        otp_hash: 'hash123',
        salt: 'salt456',
        expires_at: '2026-08-02T10:00:00.000Z',
        max_attempts: 5,
      });
    });

    it('throws when the insert fails', async () => {
      makeClient({ insertError: new Error('insert failed') });
      const repo = new SupabaseOtpRepository();
      await expect(
        repo.createOtpRecord({
          email: 'user@example.com',
          otpHash: 'h',
          salt: 's',
          expiresAt: new Date(),
          maxAttempts: 5,
        })
      ).rejects.toThrow('insert failed');
    });
  });

  describe('findLatestPendingOtp', () => {
    it('returns null when no record exists or a fetch error occurs', async () => {
      makeClient({ record: null });
      const repo = new SupabaseOtpRepository();
      await expect(repo.findLatestPendingOtp('user@example.com')).resolves.toBeNull();

      makeClient({ fetchError: new Error('db down') });
      await expect(repo.findLatestPendingOtp('user@example.com')).resolves.toBeNull();
    });

    it('returns the mapped record for a pending OTP', async () => {
      const { selectEq, is } = makeClient({
        record: makeRecord({ attempts: 1, max_attempts: 7 }),
      });
      const repo = new SupabaseOtpRepository();

      await expect(repo.findLatestPendingOtp('user@example.com')).resolves.toEqual({
        id: 'otp-1',
        otpHash: 'hash',
        salt: 'salt',
        expiresAt: new Date(makeRecord().expires_at),
        attempts: 1,
        maxAttempts: 7,
      });
      expect(selectEq).toHaveBeenCalledWith('email', 'user@example.com');
      expect(is).toHaveBeenCalledWith('verified_at', null);
    });
  });

  describe('incrementOtpAttempts', () => {
    it('updates attempts to current + 1', async () => {
      const { update, updateEq } = makeClient();
      const repo = new SupabaseOtpRepository();

      await repo.incrementOtpAttempts('otp-1', 2);

      expect(update).toHaveBeenCalledWith({ attempts: 3 });
      expect(updateEq).toHaveBeenCalledWith('id', 'otp-1');
    });

    it('throws when the update fails', async () => {
      makeClient({ updateError: new Error('update failed') });
      const repo = new SupabaseOtpRepository();
      await expect(repo.incrementOtpAttempts('otp-1', 0)).rejects.toThrow('update failed');
    });
  });

  describe('markOtpVerified', () => {
    it('sets verified_at on the record', async () => {
      const { update, updateEq } = makeClient();
      const repo = new SupabaseOtpRepository();

      await repo.markOtpVerified('otp-1');

      expect(update).toHaveBeenCalledWith({ verified_at: expect.any(String) });
      expect(updateEq).toHaveBeenCalledWith('id', 'otp-1');
    });

    it('throws when the update fails', async () => {
      makeClient({ updateError: new Error('update failed') });
      const repo = new SupabaseOtpRepository();
      await expect(repo.markOtpVerified('otp-1')).rejects.toThrow('update failed');
    });
  });
});
