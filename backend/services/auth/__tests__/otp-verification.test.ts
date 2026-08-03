import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '@/backend/services/auth/auth-service';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import type { IOtpRepository, OtpRecordData } from '@/backend/repositories/otp/otp-repository';

vi.mock('@/backend/shared/otp/generator', () => ({
  generateOtp: () => '123456',
  hashOtp: () => ({ hash: 'hash', salt: 'salt' }),
  verifyOtp: (input: string) => input === '123456',
}));

function makeOtpRecord(overrides: Partial<OtpRecordData> = {}): OtpRecordData {
  return {
    id: 'otp-1',
    otpHash: 'hash',
    salt: 'salt',
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    maxAttempts: 5,
    ...overrides,
  };
}

function createService(overrides: { record?: OtpRecordData | null } = {}) {
  const findLatestPendingOtp = vi.fn();
  if (overrides.record === undefined) {
    findLatestPendingOtp.mockResolvedValue(makeOtpRecord());
  } else {
    findLatestPendingOtp.mockResolvedValue(overrides.record);
  }
  const otpRepository: IOtpRepository = {
    createOtpRecord: vi.fn().mockResolvedValue(undefined),
    findLatestPendingOtp,
    incrementOtpAttempts: vi.fn().mockResolvedValue(undefined),
    markOtpVerified: vi.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    getUser: vi.fn().mockResolvedValue({ user: null }),
    listUsers: vi.fn().mockResolvedValue({ users: [], error: null }),
    confirmUserEmail: vi.fn().mockResolvedValue(undefined),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
  } as unknown as AuthGateway;

  const service = new AuthService(gateway, {
    otpRepository,
    emailClient: {
      sendOtpEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    },
    rateLimiter: {
      checkRateLimit: vi.fn().mockResolvedValue(true),
      getRateLimitRemaining: vi.fn().mockResolvedValue(5),
    },
    verifyTurnstile: vi.fn().mockResolvedValue(true),
    otpTtlMinutes: 5,
    otpResendCooldownSeconds: 60,
    otpMaxAttempts: 5,
    siteUrl: 'https://royaraqamia.com',
  });

  return { service, otpRepository };
}

const verifyInput = {
  email: 'user@example.com',
  otp: '123456',
  redirectTo: null,
  pendingPassword: null,
};

describe('AuthService.verifyOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not-found when no record exists', async () => {
    const { service } = createService({ record: null });
    await expect(service.verifyOtp(verifyInput)).resolves.toEqual({
      ok: false,
      message: 'لم يتم العثور على رمز التحقق',
    });
  });

  it('returns expired when the record is past expiry', async () => {
    const { service } = createService({
      record: makeOtpRecord({ expiresAt: new Date(Date.now() - 1000) }),
    });
    await expect(service.verifyOtp(verifyInput)).resolves.toEqual({
      ok: false,
      message: 'انتهت صلاحية رمز التحقق',
    });
  });

  it('returns max-attempts error when attempts reached the limit', async () => {
    const { service } = createService({
      record: makeOtpRecord({ attempts: 5, maxAttempts: 5 }),
    });
    await expect(service.verifyOtp(verifyInput)).resolves.toEqual({
      ok: false,
      message: 'تم تجاوز الحد الأقصى لمحاولات التحقق',
    });
  });

  it('increments attempts and returns incorrect for a wrong OTP', async () => {
    const { service, otpRepository } = createService({
      record: makeOtpRecord({ attempts: 1 }),
    });
    await expect(service.verifyOtp({ ...verifyInput, otp: '000000' })).resolves.toEqual({
      ok: false,
      message: 'رمز التحقق غير صحيح',
    });
    expect(otpRepository.incrementOtpAttempts).toHaveBeenCalledWith('otp-1', 1);
    expect(otpRepository.markOtpVerified).not.toHaveBeenCalled();
  });

  it('marks the record verified and continues for a correct OTP', async () => {
    const { service, otpRepository } = createService({
      record: makeOtpRecord({ attempts: 0 }),
    });
    const result = await service.verifyOtp(verifyInput);
    expect(result).toEqual({ ok: true, redirectUrl: '/', consumedPendingLogin: false });
    expect(otpRepository.markOtpVerified).toHaveBeenCalledWith('otp-1');
    expect(otpRepository.incrementOtpAttempts).not.toHaveBeenCalled();
  });
});
