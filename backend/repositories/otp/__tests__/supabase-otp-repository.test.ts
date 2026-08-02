import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAdminSupabase = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock('@/backend/transport/supabase/admin', () => ({
  getAdminSupabase: () => mockGetAdminSupabase(),
}));

vi.mock('@/backend/shared/otp/generator', () => ({
  verifyOtp: (input: string, hash: string, salt: string) => mockVerifyOtp(input, hash, salt),
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
  const single = vi
    .fn()
    .mockResolvedValue({ data: overrides.record ?? null, error: overrides.fetchError ?? null });
  const limit = vi.fn().mockReturnValue({ single });
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
  return { client, insert, update, updateEq, single, from, selectEq };
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
    mockVerifyOtp.mockImplementation((input: string) => input === '123456');
  });

  describe('createOtpRecord', () => {
    it('inserts the OTP record with default max_attempts', async () => {
      const { insert, from } = makeClient();
      const repo = new SupabaseOtpRepository();
      const expiresAt = new Date('2026-08-02T10:00:00.000Z');

      await repo.createOtpRecord('user@example.com', 'hash123', 'salt456', expiresAt);

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
      await expect(repo.createOtpRecord('user@example.com', 'h', 's', new Date())).rejects.toThrow(
        'insert failed'
      );
    });
  });

  describe('verifyOtpRecord', () => {
    it('returns not-found when no record exists or a fetch error occurs', async () => {
      makeClient({ record: null });
      const repo = new SupabaseOtpRepository();
      await expect(repo.verifyOtpRecord('user@example.com', '123456')).resolves.toEqual({
        error: 'لم يتم العثور على رمز التحقق',
      });

      makeClient({ fetchError: new Error('db down') });
      await expect(repo.verifyOtpRecord('user@example.com', '123456')).resolves.toEqual({
        error: 'لم يتم العثور على رمز التحقق',
      });
    });

    it('returns expired when the record is past expiry', async () => {
      makeClient({ record: makeRecord({ expires_at: new Date(Date.now() - 1000).toISOString() }) });
      const repo = new SupabaseOtpRepository();
      await expect(repo.verifyOtpRecord('user@example.com', '123456')).resolves.toEqual({
        error: 'انتهت صلاحية رمز التحقق',
      });
    });

    it('returns max-attempts error when attempts reached the limit', async () => {
      makeClient({ record: makeRecord({ attempts: 5, max_attempts: 5 }) });
      const repo = new SupabaseOtpRepository();
      await expect(repo.verifyOtpRecord('user@example.com', '123456')).resolves.toEqual({
        error: 'تم تجاوز الحد الأقصى لمحاولات التحقق',
      });
    });

    it('increments attempts and returns incorrect for a wrong OTP', async () => {
      const { updateEq, selectEq } = makeClient({ record: makeRecord({ attempts: 1 }) });
      const repo = new SupabaseOtpRepository();

      await expect(repo.verifyOtpRecord('user@example.com', '000000')).resolves.toEqual({
        error: 'رمز التحقق غير صحيح',
      });
      expect(selectEq).toHaveBeenCalledWith('email', 'user@example.com');
      expect(updateEq).toHaveBeenCalledWith('id', 'otp-1');
    });

    it('marks the record verified and returns success for a correct OTP', async () => {
      const { updateEq } = makeClient({ record: makeRecord({ attempts: 0 }) });
      const repo = new SupabaseOtpRepository();

      await expect(repo.verifyOtpRecord('user@example.com', '123456')).resolves.toEqual({
        success: true,
      });
      expect(updateEq).toHaveBeenCalledWith('id', 'otp-1');
    });
  });
});
