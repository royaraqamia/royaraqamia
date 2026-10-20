import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequest, MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }

    get isNetworkError(): boolean {
      return this.status === undefined;
    }
  }

  return { mockRequest: vi.fn(), MockApiError };
});

vi.mock('@/frontend/transport/http', () => ({
  request: mockRequest,
  ApiError: MockApiError,
}));

import { login, resetPassword, resendOtp, signup, updatePassword, verifyOtp } from '../auth';

// The forms act on this flag: a request that never left must not be reported as
// a credential or validation error (ADR-0031, #368).
describe('auth failures know whether the request reached the server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a login whose fetch never left as offline', async () => {
    mockRequest.mockRejectedValue(new MockApiError('تعذّر الاتصال بالخادم.'));

    await expect(
      login({ email: 'a@b.c', password: 'x', redirectTo: null, turnstileToken: '' })
    ).resolves.toMatchObject({ ok: false, offline: true, message: 'تعذّر الاتصال بالخادم.' });
  });

  it('does not call a server-answered login offline', async () => {
    mockRequest.mockRejectedValue(new MockApiError('بيانات الدُّخول غير صحيحة.', 401));

    await expect(
      login({ email: 'a@b.c', password: 'x', redirectTo: null, turnstileToken: '' })
    ).resolves.toMatchObject({ ok: false, offline: false });
  });

  it('carries the same distinction through sign-up', async () => {
    mockRequest.mockRejectedValueOnce(new MockApiError('تعذّر الاتصال بالخادم.'));

    await expect(
      signup({ name: 'س', email: 'a@b.c', password: 'x', redirectTo: null, turnstileToken: '' })
    ).resolves.toMatchObject({ ok: false, offline: true });
  });

  it('carries it through OTP verification', async () => {
    mockRequest.mockRejectedValueOnce(new MockApiError('تعذّر الاتصال بالخادم.'));

    await expect(
      verifyOtp({ email: 'a@b.c', otp: '123456', redirectTo: null })
    ).resolves.toMatchObject({ ok: false, offline: true });
  });

  it('reports a resend that reached the server as success with its message', async () => {
    mockRequest.mockResolvedValue({ message: 'أُعيد الإرسال.' });

    await expect(resendOtp('a@b.c')).resolves.toEqual({ ok: true, message: 'أُعيد الإرسال.' });
  });

  it('reports a failed resend instead of showing it as a sent code', async () => {
    mockRequest.mockRejectedValue(new MockApiError('تعذّر الاتصال بالخادم.'));

    await expect(resendOtp('a@b.c')).resolves.toMatchObject({ ok: false, offline: true });
  });

  it('keeps a password reset failure distinguishable too', async () => {
    mockRequest.mockRejectedValueOnce(new MockApiError('تعذّر الاتصال بالخادم.'));

    await expect(resetPassword('a@b.c')).resolves.toMatchObject({ ok: false, offline: true });
  });

  it('keeps the password update failure distinguishable too', async () => {
    mockRequest.mockRejectedValueOnce(new MockApiError('تعذّر الاتصال بالخادم.'));

    await expect(
      updatePassword({
        password: 'x',
        confirmPassword: 'x',
        token: 't',
        email: 'a@b.c',
        redirectTo: null,
      })
    ).resolves.toMatchObject({ ok: false, offline: true });
  });
});
