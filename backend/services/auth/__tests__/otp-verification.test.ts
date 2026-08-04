import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '@/backend/services/auth/auth-service';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import type { IOtpRepository, OtpRecordData } from '@/backend/repositories/otp/otp-repository';
import type { UserProfileRepository } from '@/backend/repositories/users/user-profile-repository';

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

function createService(
  overrides: { record?: OtpRecordData | null; rateLimitAllowed?: boolean } = {}
) {
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
  const rateLimiter = {
    checkRateLimit: vi.fn().mockResolvedValue(overrides.rateLimitAllowed ?? true),
    getRateLimitRemaining: vi.fn().mockResolvedValue(5),
  };
  const gateway = {
    getUser: vi.fn().mockResolvedValue({ user: null }),
    listUsers: vi.fn().mockResolvedValue({ users: [], error: null }),
    confirmUserEmail: vi.fn().mockResolvedValue(undefined),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ user: null, error: null }),
  } as unknown as AuthGateway;
  const pendingLoginStore = {
    readPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
  const userProfileRepository = {
    upsert: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserProfileRepository;

  const service = new AuthService(gateway, {
    otpRepository,
    userProfileRepository,
    emailClient: {
      sendOtpEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    },
    rateLimiter,
    verifyTurnstile: vi.fn().mockResolvedValue(true),
    pendingLoginStore,
    otpTtlMinutes: 5,
    otpResendCooldownSeconds: 60,
    otpMaxAttempts: 5,
    otpVerifyMaxPerMinute: 10,
    siteUrl: 'https://royaraqamia.com',
  });

  return { service, otpRepository, rateLimiter, pendingLoginStore, gateway, userProfileRepository };
}

const verifyInput = {
  email: 'user@example.com',
  otp: '123456',
  redirectTo: null,
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

  it('rejects verification when the per-email rate limit is exceeded', async () => {
    const { service, rateLimiter } = createService({ rateLimitAllowed: false });
    await expect(service.verifyOtp(verifyInput)).resolves.toEqual({
      ok: false,
      message: 'تم تجاوز عدد محاولات التحقق المسموح بها. يرجى المحاولة لاحقاً',
    });
    expect(rateLimiter.checkRateLimit).toHaveBeenCalledWith(
      'verify:user@example.com',
      10,
      60 * 1000
    );
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
    const { service, otpRepository, pendingLoginStore } = createService({
      record: makeOtpRecord({ attempts: 0 }),
    });
    const result = await service.verifyOtp(verifyInput);
    expect(result).toEqual({ ok: true, redirectUrl: '/', consumedPendingLogin: false });
    expect(otpRepository.markOtpVerified).toHaveBeenCalledWith('otp-1');
    expect(otpRepository.incrementOtpAttempts).not.toHaveBeenCalled();
    expect(pendingLoginStore.clear).not.toHaveBeenCalled();
  });

  it('auto-signs-in with the pending password and clears the store when consumed', async () => {
    const { service, otpRepository, pendingLoginStore, gateway } = createService({
      record: makeOtpRecord({ attempts: 0 }),
    });
    pendingLoginStore.readPassword.mockResolvedValue('hunter2');
    vi.mocked(gateway.listUsers).mockResolvedValue({
      users: [{ id: 'user-1', email: 'user@example.com', email_confirmed_at: null }],
      error: null,
    });

    const result = await service.verifyOtp(verifyInput);
    expect(result).toEqual({ ok: true, redirectUrl: '/', consumedPendingLogin: true });
    expect(gateway.confirmUserEmail).toHaveBeenCalledWith('user-1');
    expect(gateway.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'hunter2',
    });
    expect(pendingLoginStore.clear).toHaveBeenCalled();
    expect(otpRepository.markOtpVerified).toHaveBeenCalledWith('otp-1');
  });
});

describe('AuthService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the pending password when the account is not confirmed', async () => {
    const { service, pendingLoginStore, gateway } = createService();
    vi.mocked(gateway.signInWithPassword).mockResolvedValue({
      user: null,
      error: { message: 'Email not confirmed' },
    });

    const result = await service.login({
      email: 'user@example.com',
      password: 'hunter2',
      redirectTo: null,
      turnstileToken: '',
    });

    expect(result).toMatchObject({ needsOtp: true, email: 'user@example.com' });
    expect(pendingLoginStore.setPassword).toHaveBeenCalledWith('hunter2');
    expect(result).not.toHaveProperty('password');
  });

  it('does not store a pending password when login succeeds', async () => {
    const { service, pendingLoginStore } = createService();
    const result = await service.login({
      email: 'user@example.com',
      password: 'hunter2',
      redirectTo: null,
      turnstileToken: '',
    });
    expect(result).toEqual({ ok: true, redirectUrl: '/' });
    expect(pendingLoginStore.setPassword).not.toHaveBeenCalled();
  });
});

describe('AuthService.signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts the public user profile after a successful sign-up', async () => {
    const { service, userProfileRepository, gateway } = createService();
    vi.mocked(gateway.signUp).mockResolvedValue({
      user: { id: 'u-1' },
      error: null,
    });

    const result = await service.signup({
      name: 'منتج',
      email: 'user@example.com',
      password: 'Hunter2!',
      redirectTo: null,
      turnstileToken: '',
    });

    expect(result.ok).toBe(true);
    expect(userProfileRepository.upsert).toHaveBeenCalledWith({
      id: 'u-1',
      email: 'user@example.com',
      name: 'منتج',
    });
  });
});

describe('AuthService.resendOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects resend when there is no pending OTP record for the email', async () => {
    const { service } = createService({ record: null });
    await expect(service.resendOtp({ email: 'user@example.com' })).resolves.toEqual({
      ok: false,
      message: 'لا يوجد رمز تحقق نشط لهذا البريد الإلكتروني',
    });
  });

  it('creates and sends a new OTP when a pending record exists', async () => {
    const { service, otpRepository } = createService();
    const result = await service.resendOtp({ email: 'user@example.com' });
    expect(result).toEqual({ ok: true, message: 'تم إعادة إرسال رمز التحقق' });
    expect(otpRepository.createOtpRecord).toHaveBeenCalledWith({
      email: 'user@example.com',
      otpHash: 'hash',
      salt: 'salt',
      expiresAt: expect.any(Date),
      maxAttempts: 5,
    });
  });
});
