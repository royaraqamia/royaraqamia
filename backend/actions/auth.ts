'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/backend/transport/supabase/server';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { safeRedirect } from '@/backend/shared/safe-redirect';
import { createAuthService } from '@/backend/services/auth/auth-service';
import type {
  LoginResult,
  OAuthResult,
  SignupResult,
  SimpleResult,
  VerifyOtpResult,
} from '@/backend/services/auth/auth-service';

const authService = createAuthService();

export async function signup(_prevState: { message: string } | null, formData: FormData) {
  const result: SignupResult = await authService.signup(await createClient(), getAdminSupabase(), {
    name: formData.get('name') as string,
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    redirectTo: formData.get('redirectTo') as string | null,
    turnstileToken: formData.get('cf-turnstile-response') as string,
  });

  if (!result.ok) {
    return { message: result.message };
  }
  redirect(result.redirectUrl);
}

export async function login(_prevState: { message: string } | null, formData: FormData) {
  const result: LoginResult = await authService.login(await createClient(), {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    redirectTo: formData.get('redirectTo') as string | null,
    turnstileToken: formData.get('cf-turnstile-response') as string,
  });

  if ('needsOtp' in result) {
    // Store password temporarily so verifyOtp can auto-sign-in after confirmation
    const cookieStore = await cookies();
    cookieStore.set('pending_login', JSON.stringify({ password: result.password }), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    });
    redirect(result.redirectUrl);
  }

  if (!result.ok) {
    return { message: result.message };
  }
  redirect(result.redirectUrl);
}

type VerifyOtpActionResult = { message?: string; success?: boolean; redirectTo?: string } | null;

export async function verifyOtp(
  _prevState: VerifyOtpActionResult,
  formData: FormData
): Promise<VerifyOtpActionResult> {
  const email = formData.get('email') as string;
  const otp = formData.get('otp') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

  const cookieStore = await cookies();
  const pending = cookieStore.get('pending_login');

  let pendingPassword: string | null = null;
  if (pending) {
    try {
      const { password } = JSON.parse(pending.value);
      pendingPassword = typeof password === 'string' ? password : null;
    } catch {
      pendingPassword = null;
    }
  }

  const result: VerifyOtpResult = await authService.verifyOtp(
    await createClient(),
    getAdminSupabase(),
    { email, otp, redirectTo, pendingPassword }
  );

  if (!result.ok) {
    return { message: result.message };
  }

  if (result.consumedPendingLogin) {
    cookieStore.delete('pending_login');
  }

  return { success: true, redirectTo: result.redirectUrl };
}

export async function resendOtp(_prevState: { message: string } | null, formData: FormData) {
  const result: SimpleResult = await authService.resendOtp({
    email: formData.get('email') as string,
  });
  return { message: result.message ?? '' };
}

export async function resetPassword(_prevState: { message: string } | null, formData: FormData) {
  const result: SimpleResult = await authService.resetPassword(await createClient(), {
    email: formData.get('email') as string,
  });
  return { message: result.message ?? '' };
}

export async function updatePassword(_prevState: { message: string } | null, formData: FormData) {
  const result: SimpleResult = await authService.updatePassword(await createClient(), {
    password: formData.get('password') as string,
    confirmPassword: formData.get('confirmPassword') as string,
  });

  if (!result.ok) {
    return { message: result.message };
  }
  redirect(safeRedirect(formData.get('redirectTo') as string | null));
}

export async function logout() {
  await authService.logout(await createClient());
  redirect('/');
}

export async function signInWithGoogle(redirectTo?: string) {
  const result: OAuthResult = await authService.signInWithOAuth(
    await createClient(),
    'google',
    redirectTo
  );
  if (!result.ok) {
    throw new Error(result.message);
  }
  redirect(result.url);
}

export async function signInWithOAuth(provider: 'google', redirectTo?: string) {
  const result: OAuthResult = await authService.signInWithOAuth(
    await createClient(),
    provider,
    redirectTo
  );
  if (!result.ok) {
    throw new Error(result.message);
  }
  redirect(result.url);
}
