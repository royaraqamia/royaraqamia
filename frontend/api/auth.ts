import { ApiError, request } from '@/frontend/transport/http';
import { createClient } from '@/frontend/transport/supabase/client';
import { isNativeApp, openInSystemBrowser } from '@/frontend/shared/native-shell';
import { purgeServiceWorkerCaches } from '@/frontend/shared/cache-maintenance';
import { unregisterNativePush } from '@/frontend/api/push-native';
import type { Session, User } from '@supabase/supabase-js';

export type { Session, User };

export type AuthActionResult = { message?: string } | null;

export type SessionChangeListener = (session: Session | null) => void;

/** A failed auth call that knows whether the request ever reached the server. */
export interface AuthFailure {
  ok: false;
  message: string;
  /**
   * True when `fetch` itself rejected. The forms name the connection instead of
   * showing a permission/credential error (ADR-0031, #368): the credentials may
   * be perfectly good — we simply could not ask.
   */
  offline: boolean;
}

function authFailure(error: unknown, fallback: string): AuthFailure {
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallback,
    offline: error instanceof ApiError && error.isNetworkError,
  };
}

export async function getSession(): Promise<Session | null> {
  const client = await createClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  return session;
}

export function subscribeToSessionChanges(listener: SessionChangeListener): () => void {
  let unsubscribe: (() => void) | null = null;

  createClient()
    .then((client) => {
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event: string, session: Session | null) => {
        listener(session);
      });
      unsubscribe = () => subscription.unsubscribe();
    })
    .catch(() => {
      unsubscribe = () => {};
    });

  return () => {
    unsubscribe?.();
  };
}

export async function signOutSession(): Promise<void> {
  // Every sign-out path drops the device token; see `logout()`.
  await unregisterNativePush();
  const client = await createClient();
  await client.auth.signOut();
  // Cache Storage is the one shared surface that could still answer with the
  // previous account's render. IndexedDB is not touched: the Local Store and
  // Outbox survive sign-out until "Remove this device's copy" (#370).
  await purgeServiceWorkerCaches();
}

export async function logout(): Promise<void> {
  // Drop this device's native push token while the session still authorizes the
  // call, so the next person to use the phone does not inherit the
  // notifications. Best-effort: never block a sign-out on it.
  await unregisterNativePush();
  try {
    await request('/auth/api/logout', { method: 'POST' });
  } catch {
    throw new Error('فشل تسجيل الخروج');
  }
  // The session is gone server-side: drop account-bearing Cache Storage entries
  // before the redirect, while this document still controls the worker.
  await purgeServiceWorkerCaches();
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
  | AuthFailure
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
    return authFailure(error, 'فشل تسجيل الدخول');
  }
}

export async function signup(data: {
  name: string;
  email: string;
  password: string;
  redirectTo: string | null;
  turnstileToken: string;
}): Promise<{ ok: true; redirectUrl: string } | AuthFailure> {
  try {
    const res = await request<{ redirectUrl: string }>('/auth/api/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { ok: true, redirectUrl: res.redirectUrl };
  } catch (error) {
    return authFailure(error, 'فشل إنشاء الحساب');
  }
}

export async function verifyOtp(data: {
  email: string;
  otp: string;
  redirectTo: string | null;
}): Promise<{ ok: true; redirectUrl: string } | AuthFailure> {
  try {
    const res = await request<{ redirectTo: string }>('/auth/api/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { ok: true, redirectUrl: res.redirectTo };
  } catch (error) {
    return authFailure(error, 'فشل التحقق');
  }
}

export async function resendOtp(
  email: string
): Promise<{ ok: true; message: string } | AuthFailure> {
  try {
    const res = await request<{ message: string }>('/auth/api/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return { ok: true, message: res.message ?? '' };
  } catch (error) {
    return authFailure(error, 'فشل إعادة إرسال الرمز');
  }
}

export async function resetPassword(
  email: string,
  redirectTo?: string | null
): Promise<{ ok: true; message: string } | AuthFailure> {
  try {
    const res = await request<{ message: string }>('/auth/api/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, redirectTo: redirectTo ?? null }),
    });
    return { ok: true, message: res.message ?? '' };
  } catch (error) {
    return authFailure(error, 'فشل إرسال رابط إعادة التَّعيين');
  }
}

export async function updatePassword(data: {
  password: string;
  confirmPassword: string;
  token: string;
  email: string;
  redirectTo: string | null;
}): Promise<{ ok: true; redirectUrl: string } | AuthFailure> {
  try {
    const res = await request<{ redirectUrl: string }>('/auth/api/update-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { ok: true, redirectUrl: res.redirectUrl };
  } catch (error) {
    return authFailure(error, 'فشل تحديث كلمة المرور');
  }
}

export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  const res = await request<{ url: string }>('/auth/api/google', {
    method: 'POST',
    body: JSON.stringify({ redirectTo: redirectTo ?? undefined, nativeShell: isNativeApp() }),
  });

  // Google refuses to serve its consent screen to an embedded WebView
  // (`disallowed_useragent`), so inside the Android shell the handoff goes to
  // the system browser. Returning from it is the app's job — see
  // NATIVE_AUTH_CALLBACK_URL. On the web this is the plain navigation it always
  // was.
  if (isNativeApp() && (await openInSystemBrowser(res.url))) return;

  window.location.assign(res.url);
}
