import { describe, it, expect, vi, beforeEach } from 'vitest';

class MockRedirectError extends Error {
  url: string;
  constructor(url: string) {
    super(`Redirect: ${url}`);
    this.name = 'RedirectError';
    this.url = url;
  }
}

const mockRedirect = vi.fn((url: string) => {
  throw new MockRedirectError(url);
});

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn().mockReturnValue([]),
};

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

const mockAdminSupabase = {
  auth: {
    admin: {
      updateUserById: vi.fn(),
      listUsers: vi.fn(),
    },
  },
  from: vi.fn(),
};

const mockSupabaseClient = {
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  from: vi.fn(),
};

const mockCreateClient = vi.fn().mockResolvedValue(mockSupabaseClient);
const mockGetAdminSupabase = vi.fn().mockReturnValue(mockAdminSupabase);

vi.mock('@/backend/transport/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock('@/backend/transport/supabase/admin', () => ({
  getAdminSupabase: () => mockGetAdminSupabase(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

let mockOtp: string;

vi.mock('@/backend/shared/otp/generator', () => ({
  generateOtp: vi.fn(() => mockOtp),
  hashOtp: vi.fn(() => ({ hash: 'mock-hash-abc123', salt: 'mock-salt-xyz789' })),
  verifyOtp: vi.fn(),
}));

vi.mock('@/backend/repositories/otp/otp-repository', () => ({
  createOtpRecord: vi.fn(),
  verifyOtpRecord: vi.fn(),
}));

vi.mock('@/backend/clients/email', () => ({
  sendOtpEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('@/backend/shared/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  getRateLimitRemaining: vi.fn(),
}));

vi.mock('@/backend/clients/turnstile', () => ({
  verifyTurnstileToken: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

function mockChain(options: {
  selectResult?: unknown;
  upsertResult?: unknown;
  insertResult?: unknown;
  updateResult?: unknown;
  singleResult?: unknown;
}) {
  const mockEq = vi.fn();
  const mockIs = vi.fn();
  const mockOrder = vi.fn();
  const mockLimit = vi.fn();
  const mockSingle = vi.fn();
  const mockMaybeSingle = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockSelect = vi.fn();
  const mockUpsert = vi.fn();
  const mockFrom = vi.fn();

  mockFrom.mockImplementation((_table: string) => ({
    select: mockSelect,
    upsert: mockUpsert,
    insert: mockInsert,
    update: mockUpdate,
  }));

  mockUpsert.mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockInsert.mockResolvedValue({ error: options.insertResult ?? null });
  mockUpdate.mockReturnValue({ eq: mockEq });

  if (options.updateResult !== undefined) {
    mockEq.mockResolvedValue(options.updateResult);
  }

  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ is: mockIs });
  mockIs.mockReturnValue({ order: mockOrder });
  mockOrder.mockReturnValue({ limit: mockLimit });
  mockLimit.mockReturnValue({ single: mockSingle });

  if (options.singleResult !== undefined) {
    mockSingle.mockResolvedValue(options.singleResult);
  }

  return {
    mockFrom,
    mockMaybeSingle,
    mockEq,
    mockIs,
    mockOrder,
    mockLimit,
    mockSingle,
    mockInsert,
    mockUpdate,
    mockUpsert,
    mockSelect,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOtp = '123456';
  mockCookieStore.get.mockReturnValue(null);
  mockCookieStore.set.mockClear();
  mockCookieStore.delete.mockClear();
  mockSupabaseClient.auth.signUp.mockReset();
  mockSupabaseClient.auth.signInWithPassword.mockReset();
  mockSupabaseClient.auth.getUser.mockReset();
  mockSupabaseClient.auth.updateUser.mockReset();
  mockSupabaseClient.auth.signOut.mockReset();
  mockSupabaseClient.auth.signInWithOAuth.mockReset();
  mockSupabaseClient.auth.exchangeCodeForSession.mockReset();
  mockAdminSupabase.auth.admin.updateUserById.mockReset();
  mockAdminSupabase.auth.admin.listUsers.mockReset();
  process.env.NEXT_PUBLIC_SITE_URL = 'https://royaraqamia.com';
});

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  Object.entries(entries).forEach(([k, v]) => fd.append(k, v));
  return fd;
}

describe('safeRedirect', () => {
  async function safeRedirect(to: string | null | undefined, fallback?: string) {
    const mod = await import('@/backend/shared/safe-redirect');
    return mod.safeRedirect(to, fallback ?? '/');
  }

  it('allows valid relative paths', async () => {
    expect(await safeRedirect('/dashboard')).toBe('/dashboard');
    expect(await safeRedirect('/linksnap')).toBe('/linksnap');
  });

  it('returns fallback for null/undefined', async () => {
    expect(await safeRedirect(null)).toBe('/');
    expect(await safeRedirect(undefined)).toBe('/');
  });

  it('blocks javascript: URLs', async () => {
    expect(await safeRedirect('javascript:alert(1)')).toBe('/');
  });

  it('blocks data: URLs', async () => {
    expect(await safeRedirect('data:text/html,<script>alert(1)</script>')).toBe('/');
  });

  it('blocks vbscript: URLs', async () => {
    expect(await safeRedirect('vbscript:msgbox("x")')).toBe('/');
  });

  it('blocks external URLs starting with //', async () => {
    expect(await safeRedirect('//evil.com')).toBe('/');
  });

  it('blocks paths starting with backslashes', async () => {
    expect(await safeRedirect('\\\\evil.com')).toBe('/');
  });

  it('uses custom fallback', async () => {
    expect(await safeRedirect(null, '/custom')).toBe('/custom');
  });

  it('handles encoded URLs that decode to malicious patterns', async () => {
    expect(await safeRedirect('j%61vascript:alert(1)')).toBe('/');
    expect(await safeRedirect('%2f%2fevil.com')).toBe('/');
  });
});

describe('signup', () => {
  it('returns validation error for invalid data', async () => {
    const { signup } = await import('@/backend/actions/auth');
    const result = await signup(null, formData({ name: 'A', email: 'bad', password: '123' }));
    expect(result).toHaveProperty('message');
    expect(result.message).toBeTruthy();
  });

  it('returns turnstile error when token is invalid', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(false);

    const { signup } = await import('@/backend/actions/auth');
    const result = await signup(
      null,
      formData({
        name: 'Test',
        email: 'a@b.com',
        password: 'StrongP@ss1',
        'cf-turnstile-response': 'bad-token',
      })
    );
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('التحقق الأمني');
  });

  it('returns rate limit error', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);

    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const { signup } = await import('@/backend/actions/auth');
    const result = await signup(
      null,
      formData({ name: 'Test', email: 'a@b.com', password: 'StrongP@ss1' })
    );
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('الحد الأقصى');
  });

  it('returns supabase error on signup failure', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    mockSupabaseClient.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Some error' },
    });

    const { signup } = await import('@/backend/actions/auth');
    const result = await signup(
      null,
      formData({ name: 'Test', email: 'a@b.com', password: 'StrongP@ss1' })
    );
    expect(result).toHaveProperty('message', 'Some error');
  });

  it('handles "User already registered" error with Arabic message', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    mockSupabaseClient.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    const { signup } = await import('@/backend/actions/auth');
    const result = await signup(
      null,
      formData({ name: 'Test', email: 'a@b.com', password: 'StrongP@ss1' })
    );
    expect(result).toHaveProperty('message', 'البريد الإلكتروني مسجل مسبقاً');
  });

  it('creates user record, generates OTP, and redirects on success', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    mockSupabaseClient.auth.signUp.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const chain = mockChain({});
    mockAdminSupabase.from = chain.mockFrom;

    const { sendOtpEmail } = await import('@/backend/clients/email');
    vi.mocked(sendOtpEmail).mockResolvedValue(undefined);

    const { signup } = await import('@/backend/actions/auth');
    await expect(
      signup(
        null,
        formData({
          name: 'Test',
          email: 'a@b.com',
          password: 'StrongP@ss1',
          redirectTo: '/dashboard',
        })
      )
    ).rejects.toThrow(MockRedirectError);

    expect(chain.mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-123', email: 'a@b.com', name: 'Test' })
    );

    const { createOtpRecord } = await import('@/backend/repositories/otp/otp-repository');
    expect(createOtpRecord).toHaveBeenCalledWith(
      'a@b.com',
      'mock-hash-abc123',
      'mock-salt-xyz789',
      expect.any(Date)
    );
    expect(sendOtpEmail).toHaveBeenCalledWith('a@b.com', mockOtp);
  });

  it('continues even if email send fails', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    mockSupabaseClient.auth.signUp.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    const chain = mockChain({});
    mockAdminSupabase.from = chain.mockFrom;

    const { sendOtpEmail } = await import('@/backend/clients/email');
    vi.mocked(sendOtpEmail).mockRejectedValue(new Error('SMTP error'));

    const { signup } = await import('@/backend/actions/auth');
    await expect(
      signup(null, formData({ name: 'Test', email: 'a@b.com', password: 'StrongP@ss1' }))
    ).rejects.toThrow(MockRedirectError);

    const { createOtpRecord } = await import('@/backend/repositories/otp/otp-repository');
    expect(createOtpRecord).toHaveBeenCalled();
  });
});

describe('login', () => {
  it('returns validation error for invalid data', async () => {
    const { login } = await import('@/backend/actions/auth');
    const result = await login(null, formData({ email: 'bad', password: '12' }));
    expect(result).toHaveProperty('message');
  });

  it('returns turnstile error when token is invalid', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(false);

    const { login } = await import('@/backend/actions/auth');
    const result = await login(
      null,
      formData({ email: 'a@b.com', password: 'abc123', 'cf-turnstile-response': 'bad' })
    );
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('التحقق الأمني');
  });

  it('returns rate limit error', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);

    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const { login } = await import('@/backend/actions/auth');
    const result = await login(null, formData({ email: 'a@b.com', password: 'abc123' }));
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('الحد الأقصى');
  });

  it('returns generic error for wrong password', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    const { login } = await import('@/backend/actions/auth');
    const result = await login(null, formData({ email: 'a@b.com', password: 'wr0ngP@ss' }));
    expect(result).toHaveProperty('message', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });

  it('redirects to OTP verify page when email is not confirmed', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Email not confirmed' },
    });
    const chain = mockChain({});
    mockAdminSupabase.from = chain.mockFrom;

    const { login } = await import('@/backend/actions/auth');
    await expect(login(null, formData({ email: 'a@b.com', password: 'abc123' }))).rejects.toThrow(
      MockRedirectError
    );
  });

  it('redirects to safe URL on success', async () => {
    const { verifyTurnstileToken } = await import('@/backend/clients/turnstile');
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });

    const { login } = await import('@/backend/actions/auth');
    try {
      await login(
        null,
        formData({ email: 'a@b.com', password: 'abc123', redirectTo: '/dashboard' })
      );
    } catch (e) {
      expect((e as MockRedirectError).url).toBe('/dashboard');
    }
  });
});

describe('verifyOtp', () => {
  it('returns error when OTP record not found', async () => {
    const { verifyOtpRecord } = await import('@/backend/repositories/otp/otp-repository');
    vi.mocked(verifyOtpRecord).mockResolvedValue({ error: 'لم يتم العثور على رمز التحقق' });

    const { verifyOtp } = await import('@/backend/actions/auth');
    const result = await verifyOtp(null, formData({ email: 'a@b.com', otp: '123456' }));
    expect(result).toEqual({ message: 'لم يتم العثور على رمز التحقق' });
  });

  it('confirms email via admin API when user session exists and email not confirmed', async () => {
    const { verifyOtpRecord } = await import('@/backend/repositories/otp/otp-repository');
    vi.mocked(verifyOtpRecord).mockResolvedValue({ success: true });

    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email_confirmed_at: null } },
      error: null,
    });

    mockAdminSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });
    const chain = mockChain({});
    mockAdminSupabase.from = chain.mockFrom;

    const { verifyOtp } = await import('@/backend/actions/auth');
    const result = await verifyOtp(null, formData({ email: 'a@b.com', otp: '123456' }));
    expect(result).toEqual({ success: true, redirectTo: '/' });

    expect(mockAdminSupabase.auth.admin.updateUserById).toHaveBeenCalledWith('user-123', {
      email_confirm: true,
    });
  });

  it('confirms email via admin API by listing users when no session', async () => {
    const { verifyOtpRecord } = await import('@/backend/repositories/otp/otp-repository');
    vi.mocked(verifyOtpRecord).mockResolvedValue({ success: true });

    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    mockAdminSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'user-456', email: 'a@b.com', email_confirmed_at: null }] },
      error: null,
    });
    mockAdminSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });
    const chain = mockChain({});
    mockAdminSupabase.from = chain.mockFrom;

    const { verifyOtp } = await import('@/backend/actions/auth');
    const result = await verifyOtp(
      null,
      formData({ email: 'a@b.com', otp: '123456', redirectTo: '/dashboard' })
    );
    expect(result).toEqual({ success: true, redirectTo: '/dashboard' });
    expect(mockAdminSupabase.auth.admin.updateUserById).toHaveBeenCalledWith('user-456', {
      email_confirm: true,
    });
  });

  it('auto-signs-in with pending_login cookie', async () => {
    const { verifyOtpRecord } = await import('@/backend/repositories/otp/otp-repository');
    vi.mocked(verifyOtpRecord).mockResolvedValue({ success: true });

    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    mockAdminSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'user-789', email: 'a@b.com', email_confirmed_at: null }] },
      error: null,
    });
    mockAdminSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    mockCookieStore.get.mockReturnValue({ value: JSON.stringify({ password: 'my-pass' }) });
    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-789' } },
      error: null,
    });

    const chain = mockChain({});
    mockAdminSupabase.from = chain.mockFrom;

    const { verifyOtp } = await import('@/backend/actions/auth');
    const result = await verifyOtp(null, formData({ email: 'a@b.com', otp: '123456' }));
    expect(result).toEqual({ success: true, redirectTo: '/' });
    expect(mockSupabaseClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'my-pass',
    });
    expect(mockCookieStore.delete).toHaveBeenCalledWith('pending_login');
  });

  it('handles auto-sign-in failure gracefully (expired cookie)', async () => {
    const { verifyOtpRecord } = await import('@/backend/repositories/otp/otp-repository');
    vi.mocked(verifyOtpRecord).mockResolvedValue({ success: true });

    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    mockAdminSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'user-789', email: 'a@b.com', email_confirmed_at: null }] },
      error: null,
    });
    mockAdminSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    mockCookieStore.get.mockReturnValue({ value: JSON.stringify({ password: 'old-pass' }) });
    mockSupabaseClient.auth.signInWithPassword.mockRejectedValue(new Error('Wrong password'));

    const chain = mockChain({});
    mockAdminSupabase.from = chain.mockFrom;

    const { verifyOtp } = await import('@/backend/actions/auth');
    const result = await verifyOtp(null, formData({ email: 'a@b.com', otp: '123456' }));
    expect(result).toEqual({ success: true, redirectTo: '/' });
    expect(mockCookieStore.delete).toHaveBeenCalledWith('pending_login');
  });
});

describe('resendOtp', () => {
  it('returns rate limit error', async () => {
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const { resendOtp } = await import('@/backend/actions/auth');
    const result = await resendOtp(null, formData({ email: 'a@b.com' }));
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('الانتظار');
  });

  it('returns error when email send fails', async () => {
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const { sendOtpEmail } = await import('@/backend/clients/email');
    vi.mocked(sendOtpEmail).mockRejectedValue(new Error('Send failed'));

    const chain = mockChain({});
    mockAdminSupabase.from = chain.mockFrom;

    const { resendOtp } = await import('@/backend/actions/auth');
    const result = await resendOtp(null, formData({ email: 'a@b.com' }));
    expect(result).toEqual({ message: 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقاً' });
  });

  it('generates new OTP and sends email on success', async () => {
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const { sendOtpEmail } = await import('@/backend/clients/email');
    vi.mocked(sendOtpEmail).mockResolvedValue(undefined);

    const chain = mockChain({});
    mockAdminSupabase.from = chain.mockFrom;

    const { resendOtp } = await import('@/backend/actions/auth');
    const result = await resendOtp(null, formData({ email: 'a@b.com' }));
    expect(result).toEqual({ message: 'تم إعادة إرسال رمز التحقق' });

    const { createOtpRecord } = await import('@/backend/repositories/otp/otp-repository');
    expect(createOtpRecord).toHaveBeenCalledWith(
      'a@b.com',
      'mock-hash-abc123',
      'mock-salt-xyz789',
      expect.any(Date)
    );
    expect(sendOtpEmail).toHaveBeenCalledWith('a@b.com', mockOtp);
  });
});

describe('resetPassword', () => {
  it('returns rate limit error', async () => {
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const { resetPassword } = await import('@/backend/actions/auth');
    const result = await resetPassword(null, formData({ email: 'a@b.com' }));
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('الحد الأقصى');
  });

  it('returns supabase error', async () => {
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    mockSupabaseClient.auth.resetPasswordForEmail = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'User not found' } });

    const { resetPassword } = await import('@/backend/actions/auth');
    const result = await resetPassword(null, formData({ email: 'a@b.com' }));
    expect(result).toEqual({ message: 'User not found' });
  });

  it('sends reset email on success', async () => {
    const { checkRateLimit } = await import('@/backend/shared/rate-limiter');
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    mockSupabaseClient.auth.resetPasswordForEmail = vi
      .fn()
      .mockResolvedValue({ data: {}, error: null });

    const { resetPassword } = await import('@/backend/actions/auth');
    const result = await resetPassword(null, formData({ email: 'a@b.com' }));
    expect(result).toEqual({
      message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني',
    });
    expect(mockSupabaseClient.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
      redirectTo: 'https://royaraqamia.com/auth/update-password',
    });
  });
});

describe('updatePassword', () => {
  it('returns error if passwords do not match', async () => {
    const { updatePassword } = await import('@/backend/actions/auth');
    const result = await updatePassword(
      null,
      formData({ password: 'NewP@ss1', confirmPassword: 'OtherP@ss1' })
    );
    expect(result).toEqual({ message: 'كلمة المرور غير متطابقة' });
  });

  it('returns validation error for weak password', async () => {
    const { updatePassword } = await import('@/backend/actions/auth');
    const result = await updatePassword(
      null,
      formData({ password: 'weak', confirmPassword: 'weak' })
    );
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('8');
  });

  it('returns supabase error', async () => {
    mockSupabaseClient.auth.updateUser.mockResolvedValue({
      data: null,
      error: { message: 'Session not found' },
    });

    const { updatePassword } = await import('@/backend/actions/auth');
    const result = await updatePassword(
      null,
      formData({ password: 'NewP@ss1', confirmPassword: 'NewP@ss1' })
    );
    expect(result).toEqual({ message: 'Session not found' });
  });

  it('redirects on success', async () => {
    mockSupabaseClient.auth.updateUser.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });

    const { updatePassword } = await import('@/backend/actions/auth');
    await expect(
      updatePassword(
        null,
        formData({ password: 'NewP@ss1', confirmPassword: 'NewP@ss1', redirectTo: '/dashboard' })
      )
    ).rejects.toThrow(MockRedirectError);
  });
});

describe('logout', () => {
  it('signs out and redirects to home', async () => {
    mockSupabaseClient.auth.signOut.mockResolvedValue({ error: null });

    const { logout } = await import('@/backend/actions/auth');
    await expect(logout()).rejects.toThrow(MockRedirectError);
    expect(mockSupabaseClient.auth.signOut).toHaveBeenCalled();
  });
});

describe('signInWithGoogle', () => {
  it('redirects to OAuth URL on success', async () => {
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/auth?...' },
      error: null,
    });

    const { signInWithGoogle } = await import('@/backend/actions/auth');
    await expect(signInWithGoogle()).rejects.toThrow(MockRedirectError);
  });

  it('throws on OAuth error', async () => {
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: 'Provider not enabled' },
    });

    const { signInWithGoogle } = await import('@/backend/actions/auth');
    await expect(signInWithGoogle()).rejects.toThrow('Provider not enabled');
  });
});

describe('signInWithOAuth', () => {
  it('redirects to OAuth URL with google provider and next param', async () => {
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/auth?...' },
      error: null,
    });

    const { signInWithOAuth } = await import('@/backend/actions/auth');
    await expect(signInWithOAuth('google', '/spendtrack')).rejects.toThrow(MockRedirectError);
  });
});
