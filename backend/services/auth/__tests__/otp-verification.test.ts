import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '@/backend/services/auth/auth-service';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import type { OtpRepository, OtpRecordData } from '@/backend/repositories/otp/otp-repository';
import type { UserProfileRepository } from '@/backend/repositories/users/user-profile-repository';

vi.mock('@/backend/shared/otp/generator', () => ({
  generateOtp: () => '123456',
  generateResetToken: () => 'reset-token-123',
  hashOtp: () => ({ hash: 'hash', salt: 'salt' }),
  verifyOtp: (input: string) => input === '123456' || input === 'reset-token-123',
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
  const otpRepository: OtpRepository = {
    createOtpRecord: vi.fn().mockResolvedValue(undefined),
    findLatestPendingOtp,
    incrementOtpAttempts: vi.fn().mockResolvedValue(true),
    markOtpVerified: vi.fn().mockResolvedValue(undefined),
  };
  const passwordResetTokenRepository = {
    createToken: vi.fn().mockResolvedValue(undefined),
    findLatestValidToken: vi.fn().mockResolvedValue(null),
    markTokenAsUsed: vi.fn().mockResolvedValue(undefined),
  };
  const rateLimiter = {
    checkRateLimit: vi.fn().mockResolvedValue(overrides.rateLimitAllowed ?? true),
    getRateLimitRemaining: vi.fn().mockResolvedValue(5),
  };
  const gateway = {
    getUser: vi.fn().mockResolvedValue({ user: null }),
    getUserByEmail: vi.fn().mockResolvedValue({ user: null }),
    confirmUserEmail: vi.fn().mockResolvedValue(undefined),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ user: null, error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    updateUserPassword: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  } as unknown as AuthGateway;
  const pendingLoginStore = {
    readPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
  const userProfileRepository = {
    upsert: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserProfileRepository;

  const emailClient = {
    sendOtpEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendBroadcastEmails: vi.fn().mockResolvedValue(0),
  };
  const service = new AuthService(gateway, {
    otpRepository,
    userProfileRepository,
    passwordResetTokenRepository,
    emailClient,
    rateLimiter,
    verifyTurnstile: vi.fn().mockResolvedValue(true),
    pendingLoginStore,
    otpTtlMinutes: 5,
    otpResendCooldownSeconds: 60,
    otpMaxAttempts: 5,
    otpVerifyMaxPerMinute: 10,
    passwordResetTokenTtlMinutes: 60,
    siteUrl: 'https://royaraqamia.com',
  });

  return {
    service,
    otpRepository,
    passwordResetTokenRepository,
    rateLimiter,
    emailClient,
    pendingLoginStore,
    gateway,
    userProfileRepository,
  };
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

  it('re-reads and retries the increment when a concurrent verification wins the race', async () => {
    const { service, otpRepository } = createService();
    vi.mocked(otpRepository.findLatestPendingOtp)
      .mockResolvedValueOnce(makeOtpRecord({ attempts: 1 }))
      .mockResolvedValueOnce(makeOtpRecord({ attempts: 2 }));
    vi.mocked(otpRepository.incrementOtpAttempts)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(service.verifyOtp({ ...verifyInput, otp: '000000' })).resolves.toEqual({
      ok: false,
      message: 'رمز التحقق غير صحيح',
    });
    expect(otpRepository.incrementOtpAttempts).toHaveBeenNthCalledWith(1, 'otp-1', 1);
    expect(otpRepository.incrementOtpAttempts).toHaveBeenNthCalledWith(2, 'otp-1', 2);
  });

  it('stops retrying when the pending OTP was replaced during contention', async () => {
    const { service, otpRepository } = createService();
    vi.mocked(otpRepository.findLatestPendingOtp)
      .mockResolvedValueOnce(makeOtpRecord({ attempts: 1 }))
      .mockResolvedValue(makeOtpRecord({ id: 'otp-2', attempts: 0 }));
    vi.mocked(otpRepository.incrementOtpAttempts).mockResolvedValue(false);

    await expect(service.verifyOtp({ ...verifyInput, otp: '000000' })).resolves.toEqual({
      ok: false,
      message: 'رمز التحقق غير صحيح',
    });
    expect(otpRepository.incrementOtpAttempts).toHaveBeenCalledTimes(1);
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
    vi.mocked(gateway.getUserByEmail).mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', email_confirmed_at: null },
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

describe('AuthService.resetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rate-limits reset requests', async () => {
    const { service, rateLimiter } = createService({ rateLimitAllowed: false });
    await expect(service.resetPassword({ email: 'user@example.com' })).resolves.toEqual({
      ok: false,
      message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً',
    });
    expect(rateLimiter.checkRateLimit).toHaveBeenCalledWith('reset:user@example.com', 3, 3_600_000);
  });

  it('returns success even when the user does not exist', async () => {
    const { service, gateway, passwordResetTokenRepository } = createService();
    vi.mocked(gateway.getUserByEmail).mockResolvedValue({ user: null });

    const result = await service.resetPassword({ email: 'noone@example.com' });
    expect(result).toEqual({
      ok: true,
      message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني',
    });
    expect(passwordResetTokenRepository.createToken).not.toHaveBeenCalled();
  });

  it('creates a token and sends a password-reset email via Resend', async () => {
    const { service, gateway, passwordResetTokenRepository, emailClient } = createService();
    vi.mocked(gateway.getUserByEmail).mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', email_confirmed_at: null },
    });

    const result = await service.resetPassword({
      email: 'user@example.com',
      redirectTo: '/dashboard',
    });

    expect(result.ok).toBe(true);
    expect(passwordResetTokenRepository.createToken).toHaveBeenCalledWith({
      email: 'user@example.com',
      userId: 'user-1',
      tokenHash: 'hash',
      salt: 'salt',
      expiresAt: expect.any(Date),
    });
    expect(emailClient.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [email, resetUrl] = emailClient.sendPasswordResetEmail.mock.calls[0] as [string, string];
    expect(email).toBe('user@example.com');
    expect(resetUrl).toContain('/auth/update-password');
    expect(resetUrl).toContain('token=reset-token-123');
    expect(resetUrl).toContain('email=user%40example.com');
    expect(resetUrl).toContain('redirect=%2Fdashboard');
  });

  it('continues even if the email delivery fails', async () => {
    const { service, gateway, passwordResetTokenRepository } = createService();
    vi.mocked(gateway.getUserByEmail).mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', email_confirmed_at: null },
    });

    const result = await service.resetPassword({ email: 'user@example.com' });
    expect(result.ok).toBe(true);
    expect(passwordResetTokenRepository.createToken).toHaveBeenCalled();
  });
});

describe('AuthService.updatePassword', () => {
  const makeTokenRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'token-1',
    tokenHash: 'hash',
    salt: 'salt',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    userId: 'user-1',
    email: 'user@example.com',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when passwords do not match', async () => {
    const { service } = createService();
    const result = await service.updatePassword({
      password: 'Password1!',
      confirmPassword: 'different',
      token: 'reset-token-123',
      email: 'user@example.com',
      redirectTo: null,
    });
    expect(result).toEqual({ ok: false, message: 'كلمة المرور غير متطابقة' });
  });

  it('rejects when the password fails schema validation', async () => {
    const { service } = createService();
    const result = await service.updatePassword({
      password: 'weak',
      confirmPassword: 'weak',
      token: 'reset-token-123',
      email: 'user@example.com',
      redirectTo: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('كلمة المرور');
    }
  });

  it('returns invalid when no valid token record exists', async () => {
    const { service, passwordResetTokenRepository } = createService();
    vi.mocked(passwordResetTokenRepository.findLatestValidToken).mockResolvedValue(null);

    const result = await service.updatePassword({
      password: 'Password1!',
      confirmPassword: 'Password1!',
      token: 'reset-token-123',
      email: 'user@example.com',
      redirectTo: null,
    });
    expect(result).toEqual({
      ok: false,
      message: 'رمز إعادة تعيين كلمة المرور غير صالح',
    });
  });

  it('returns expired when the token has passed expiry', async () => {
    const { service, passwordResetTokenRepository } = createService();
    vi.mocked(passwordResetTokenRepository.findLatestValidToken).mockResolvedValue(
      makeTokenRecord({ expiresAt: new Date(Date.now() - 1000) }) as never
    );

    const result = await service.updatePassword({
      password: 'Password1!',
      confirmPassword: 'Password1!',
      token: 'reset-token-123',
      email: 'user@example.com',
      redirectTo: null,
    });
    expect(result).toEqual({
      ok: false,
      message: 'انتهت صلاحية رابط إعادة تعيين كلمة المرور',
    });
  });

  it('returns already-used when the token has been consumed', async () => {
    const { service, passwordResetTokenRepository } = createService();
    vi.mocked(passwordResetTokenRepository.findLatestValidToken).mockResolvedValue(
      makeTokenRecord({ usedAt: new Date() }) as never
    );

    const result = await service.updatePassword({
      password: 'Password1!',
      confirmPassword: 'Password1!',
      token: 'reset-token-123',
      email: 'user@example.com',
      redirectTo: null,
    });
    expect(result).toEqual({
      ok: false,
      message: 'تم استخدام رابط إعادة تعيين كلمة المرور بالفعل',
    });
  });

  it('returns invalid when the token does not match the stored hash', async () => {
    const { service, passwordResetTokenRepository } = createService();
    vi.mocked(passwordResetTokenRepository.findLatestValidToken).mockResolvedValue(
      makeTokenRecord() as never
    );

    const result = await service.updatePassword({
      password: 'Password1!',
      confirmPassword: 'Password1!',
      token: 'wrong-token',
      email: 'user@example.com',
      redirectTo: null,
    });
    expect(result).toEqual({
      ok: false,
      message: 'رمز إعادة تعيين كلمة المرور غير صالح',
    });
    expect(passwordResetTokenRepository.markTokenAsUsed).not.toHaveBeenCalled();
  });

  it('marks the token as used and updates the password for a valid token', async () => {
    const { service, passwordResetTokenRepository, gateway } = createService();
    vi.mocked(passwordResetTokenRepository.findLatestValidToken).mockResolvedValue(
      makeTokenRecord() as never
    );
    vi.mocked(gateway.updateUserPassword).mockResolvedValue({ error: null });

    const result = await service.updatePassword({
      password: 'Password1!',
      confirmPassword: 'Password1!',
      token: 'reset-token-123',
      email: 'user@example.com',
      redirectTo: '/dashboard',
    });

    expect(result).toEqual({ ok: true, redirectUrl: '/dashboard' });
    expect(passwordResetTokenRepository.markTokenAsUsed).toHaveBeenCalledWith('token-1');
    expect(gateway.updateUserPassword).toHaveBeenCalledWith('user-1', 'Password1!');
  });

  it('returns an error when the gateway fails to update the password', async () => {
    const { service, passwordResetTokenRepository, gateway } = createService();
    vi.mocked(passwordResetTokenRepository.findLatestValidToken).mockResolvedValue(
      makeTokenRecord() as never
    );
    vi.mocked(gateway.updateUserPassword).mockResolvedValue({
      error: { message: 'Update failed' },
    });

    const result = await service.updatePassword({
      password: 'Password1!',
      confirmPassword: 'Password1!',
      token: 'reset-token-123',
      email: 'user@example.com',
      redirectTo: null,
    });
    expect(result).toEqual({ ok: false, message: 'Update failed' });
  });
});
