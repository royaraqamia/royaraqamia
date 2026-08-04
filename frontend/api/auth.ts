import { request } from '@/frontend/transport/http';
import { createClient } from '@/frontend/transport/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

export type { Session, User };

export type AuthActionResult = { message?: string } | null;

export type SessionChangeListener = (session: Session | null) => void;

export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  return session;
}

export function subscribeToSessionChanges(listener: SessionChangeListener): () => void {
  const {
    data: { subscription },
  } = createClient().auth.onAuthStateChange((_event: string, session: Session | null) => {
    listener(session);
  });
  return () => subscription.unsubscribe();
}

export async function signOutSession(): Promise<void> {
  await createClient().auth.signOut();
}

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
