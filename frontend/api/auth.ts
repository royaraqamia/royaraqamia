import { request } from '@/frontend/transport/http';

export type AuthActionResult = { message?: string } | null;

export async function logout(): Promise<void> {
  try {
    await request('/auth/api/logout', { method: 'POST' });
  } catch {
    throw new Error('فشل تسجيل الخروج');
  }
  window.location.assign('/');
}

export async function login(data: {
  email: string;
  password: string;
  redirectTo: string | null;
  turnstileToken: string;
}): Promise<
  | { ok: true; redirectUrl: string }
  | { ok: true; needsOtp: true; redirectUrl: string }
  | { ok: false; message: string }
> {
  try {
    const res = await request<{ redirectUrl: string; needsOtp?: boolean }>('/auth/api/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.needsOtp
      ? { ok: true, needsOtp: true, redirectUrl: res.redirectUrl }
      : { ok: true, redirectUrl: res.redirectUrl };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'فشل تسجيل الدخول' };
  }
}

export async function signup(data: {
  name: string;
  email: string;
  password: string;
  redirectTo: string | null;
  turnstileToken: string;
}): Promise<{ ok: true; redirectUrl: string } | { ok: false; message: string }> {
  try {
    const res = await request<{ redirectUrl: string }>('/auth/api/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { ok: true, redirectUrl: res.redirectUrl };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'فشل إنشاء الحساب' };
  }
}

export async function verifyOtp(data: {
  email: string;
  otp: string;
  redirectTo: string | null;
}): Promise<{ ok: true; redirectUrl: string } | { ok: false; message: string }> {
  try {
    const res = await request<{ redirectTo: string }>('/auth/api/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { ok: true, redirectUrl: res.redirectTo };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'فشل التحقق' };
  }
}

export async function resendOtp(email: string): Promise<{ message: string }> {
  try {
    const res = await request<{ message: string }>('/auth/api/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return { message: res.message ?? '' };
  } catch (error) {
    return { message: error instanceof Error ? error.message : '' };
  }
}

export async function resetPassword(email: string): Promise<{ message: string }> {
  try {
    const res = await request<{ message: string }>('/auth/api/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return { message: res.message ?? '' };
  } catch (error) {
    return { message: error instanceof Error ? error.message : '' };
  }
}

export async function updatePassword(data: {
  password: string;
  confirmPassword: string;
  redirectTo: string | null;
}): Promise<{ ok: true; redirectUrl: string } | { ok: false; message: string }> {
  try {
    const res = await request<{ redirectUrl: string }>('/auth/api/update-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { ok: true, redirectUrl: res.redirectUrl };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'فشل تحديث كلمة المرور' };
  }
}

export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  const res = await request<{ url: string }>('/auth/api/google', {
    method: 'POST',
    body: JSON.stringify({ redirectTo: redirectTo ?? undefined }),
  });
  window.location.assign(res.url);
}
