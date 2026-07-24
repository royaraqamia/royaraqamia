'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { generateOtp, hashOtp } from '@/lib/otp/generator';
import { createOtpRecord, verifyOtpRecord } from '@/lib/otp/repository';
import { sendOtpEmail } from '@/infrastructure/email/resend';
import { checkRateLimit } from '@/lib/rate-limiter';
import { OTP_CONFIG } from '@/lib/otp/config';
import { SignupSchema, UpdatePasswordSchema } from '@/lib/schemas';

function safeRedirect(to: string | null, fallback: string = '/'): string {
  if (!to || !to.startsWith('/') || to.startsWith('//')) return fallback;
  return to;
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

  if (!checkRateLimit(`signup:${email}`, 3, 60 * 60 * 1000)) {
    return { message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
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

  const otp = generateOtp();
  const { hash, salt } = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

  await createOtpRecord(email, hash, salt, expiresAt);
  await sendOtpEmail(email, otp);

  const params = new URLSearchParams({ email });
  if (redirectTo) params.set('redirect', redirectTo);
  redirect(`/auth/verify-otp?${params.toString()}`);
}

export async function login(_prevState: { message: string } | null, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes('Email not confirmed')) {
      const otp = generateOtp();
      const { hash, salt } = hashOtp(otp);
      const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

      await createOtpRecord(email, hash, salt, expiresAt);
      await sendOtpEmail(email, otp);

      const params = new URLSearchParams({ email });
      if (redirectTo) params.set('redirect', redirectTo);
      redirect(`/auth/verify-otp?${params.toString()}`);
    }
    return { message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
  }

  redirect(safeRedirect(redirectTo));
}

export async function verifyOtp(_prevState: { message: string } | null, formData: FormData) {
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
    // No session (login flow with unconfirmed email) — find user by email via admin API
    const { data: users, error: listError } = await admin.auth.admin.listUsers();
    if (!listError && users) {
      const target = users.users.find((u) => u.email === email);
      if (target && target.email_confirmed_at === null) {
        await admin.auth.admin.updateUserById(target.id, { email_confirm: true });
      }
    }
  }

  redirect(safeRedirect(redirectTo));
}

export async function resendOtp(_prevState: { message: string } | null, formData: FormData) {
  const email = formData.get('email') as string;

  if (!checkRateLimit(`resend:${email}`, 1, OTP_CONFIG.RESEND_COOLDOWN_SECONDS * 1000)) {
    return { message: 'يرجى الانتظار قبل إعادة الإرسال' };
  }

  const otp = generateOtp();
  const { hash, salt } = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

  await createOtpRecord(email, hash, salt, expiresAt);
  await sendOtpEmail(email, otp);

  return { message: 'تم إعادة إرسال رمز التحقق' };
}

export async function resetPassword(_prevState: { message: string } | null, formData: FormData) {
  const email = formData.get('email') as string;

  if (!checkRateLimit(`reset:${email}`, 3, 60 * 60 * 1000)) {
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
  const redirectTo = formData.get('redirectTo') as string | null;

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
  if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
    callbackUrl.searchParams.set('next', redirectTo);
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
  if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
    callbackUrl.searchParams.set('next', redirectTo);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error) throw error;
  if (data.url) redirect(data.url);
}
