'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { generateOtp, hashOtp } from '@/lib/otp/generator';
import { createOtpRecord, verifyOtpRecord } from '@/lib/otp/repository';
import { sendOtpEmail } from '@/infrastructure/email/resend';
import { checkRateLimit } from '@/lib/rate-limiter';
import { OTP_CONFIG } from '@/lib/otp/config';
import { LoginSchema, SignupSchema, UpdatePasswordSchema } from '@/lib/schemas';
import { verifyTurnstileToken } from '@/lib/turnstile';

export function safeRedirect(to: string | null | undefined, fallback: string = '/'): string {
  if (!to) return fallback;
  try {
    const decoded = decodeURIComponent(to);
    if (!decoded.startsWith('/')) return fallback;
    if (decoded.startsWith('//') || decoded.startsWith('\\\\')) return fallback;
    if (/^\/\//.test(to)) return fallback;
    if (/^(javascript|data|vbscript):/i.test(decoded)) return fallback;
    return decoded;
  } catch {
    return fallback;
  }
}

export async function signup(_prevState: { message: string } | null, formData: FormData) {
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

  const parsed = SignupSchema.safeParse({ name, email, password });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message || 'بيانات غير صحيحة' };
  }

  const turnstileTokenSignup = formData.get('cf-turnstile-response') as string;
  if (turnstileTokenSignup && !(await verifyTurnstileToken(turnstileTokenSignup))) {
    return { message: 'فشل التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى' };
  }

  const signupRateOk = await checkRateLimit(`signup:${email}`, 3, 60 * 60 * 1000);
  if (!signupRateOk) {
    return { message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
  }

  const supabase = await createClient();

  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    return {
      message:
        error.message === 'User already registered'
          ? 'البريد الإلكتروني مسجل مسبقاً'
          : error.message,
    };
  }

  if (signUpData.user?.id) {
    const admin = getAdminSupabase();
    await admin
      .from('users')
      .upsert({
        id: signUpData.user.id,
        email,
        name,
        created_at: new Date().toISOString(),
      })
      .maybeSingle();
  }

  const otp = generateOtp();
  const { hash, salt } = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

  await createOtpRecord(email, hash, salt, expiresAt);
  try {
    await sendOtpEmail(email, otp);
  } catch {
    // Email delivery failure — OTP is created, user can still resend from verify page
  }

  const params = new URLSearchParams({ email });
  if (redirectTo) params.set('redirect', redirectTo);
  redirect(`/auth/verify-otp?${params.toString()}`);
}

export async function login(_prevState: { message: string } | null, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

  const parsed = LoginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message || 'بيانات غير صحيحة' };
  }

  const turnstileTokenLogin = formData.get('cf-turnstile-response') as string;
  if (turnstileTokenLogin && !(await verifyTurnstileToken(turnstileTokenLogin))) {
    return { message: 'فشل التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى' };
  }

  const loginRateOk = await checkRateLimit(`login:${email}`, 5, 60 * 1000);
  if (!loginRateOk) {
    return { message: 'تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes('Email not confirmed')) {
      const otp = generateOtp();
      const { hash, salt } = hashOtp(otp);
      const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

      await createOtpRecord(email, hash, salt, expiresAt);
      try {
        await sendOtpEmail(email, otp);
      } catch {
        // Email delivery failure — OTP is created, user can resend
      }

      // Store password temporarily so verifyOtp can auto-sign-in after confirmation
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      cookieStore.set('pending_login', JSON.stringify({ password }), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 300,
        path: '/',
      });

      const params = new URLSearchParams({ email });
      if (redirectTo) params.set('redirect', redirectTo);
      redirect(`/auth/verify-otp?${params.toString()}`);
    }
    return { message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
  }

  redirect(safeRedirect(redirectTo));
}

type VerifyOtpResult = { message?: string; success?: boolean; redirectTo?: string } | null;

export async function verifyOtp(
  _prevState: VerifyOtpResult,
  formData: FormData
): Promise<VerifyOtpResult> {
  const email = formData.get('email') as string;
  const otp = formData.get('otp') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

  const result = await verifyOtpRecord(email, otp);

  if (result.error) {
    return { message: result.error };
  }

  const admin = getAdminSupabase();

  // Try session-first (signup flow — user already has unconfirmed session)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && user.email_confirmed_at === null) {
    await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
  } else {
    const { data: usersData, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 10000,
    });
    if (!listError && usersData) {
      const targetUser = usersData.users.find((u) => u.email === email);
      if (targetUser && targetUser.email_confirmed_at === null) {
        await admin.auth.admin.updateUserById(targetUser.id, { email_confirm: true });

        // Auto-sign-in if user came from login flow (has pending_login cookie)
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const pending = cookieStore.get('pending_login');
        if (pending) {
          try {
            const { password } = JSON.parse(pending.value);
            await supabase.auth.signInWithPassword({ email, password });
          } catch {
            // Cookie expired or password changed — user will need to log in manually
          }
          cookieStore.delete('pending_login');
        }
      }
    }
  }

  return { success: true, redirectTo: safeRedirect(redirectTo) };
}

export async function resendOtp(_prevState: { message: string } | null, formData: FormData) {
  const email = formData.get('email') as string;

  const resendRateOk = await checkRateLimit(
    `resend:${email}`,
    1,
    OTP_CONFIG.RESEND_COOLDOWN_SECONDS * 1000
  );
  if (!resendRateOk) {
    return { message: 'يرجى الانتظار قبل إعادة الإرسال' };
  }

  const otp = generateOtp();
  const { hash, salt } = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

  await createOtpRecord(email, hash, salt, expiresAt);
  try {
    await sendOtpEmail(email, otp);
  } catch {
    return { message: 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقاً' };
  }

  return { message: 'تم إعادة إرسال رمز التحقق' };
}

export async function resetPassword(_prevState: { message: string } | null, formData: FormData) {
  const email = formData.get('email') as string;

  const resetRateOk = await checkRateLimit(`reset:${email}`, 3, 60 * 60 * 1000);
  if (!resetRateOk) {
    return { message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com';

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/update-password`,
  });

  if (error) {
    return { message: error.message };
  }

  return { message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني' };
}

export async function updatePassword(_prevState: { message: string } | null, formData: FormData) {
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

  if (password !== confirmPassword) {
    return { message: 'كلمة المرور غير متطابقة' };
  }

  const parsed = UpdatePasswordSchema.safeParse({ password });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message || 'كلمة المرور غير صحيحة' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { message: error.message };
  }

  redirect(safeRedirect(redirectTo));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

export async function signInWithGoogle(redirectTo?: string) {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com';

  const callbackUrl = new URL(`${siteUrl}/auth/callback`);
  const safeNext = safeRedirect(redirectTo);
  if (safeNext !== '/') {
    callbackUrl.searchParams.set('next', safeNext);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error) throw error;
  if (data.url) redirect(data.url);
}

export async function signInWithOAuth(provider: 'google', redirectTo?: string) {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com';

  const callbackUrl = new URL(`${siteUrl}/auth/callback`);
  const safeNext = safeRedirect(redirectTo);
  if (safeNext !== '/') {
    callbackUrl.searchParams.set('next', safeNext);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error) throw error;
  if (data.url) redirect(data.url);
}
