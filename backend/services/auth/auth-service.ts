import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/contracts/database.types';
import { generateOtp, hashOtp } from '@/backend/shared/otp/generator';
import { createOtpRecord, verifyOtpRecord } from '@/backend/repositories/otp/otp-repository';
import { sendOtpEmail } from '@/backend/clients/email';
import { checkRateLimit } from '@/backend/shared/rate-limiter';
import { OTP_CONFIG } from '@/backend/shared/otp/config';
import { LoginSchema, SignupSchema, UpdatePasswordSchema } from '@/shared/contracts/auth';
import { verifyTurnstileToken } from '@/backend/clients/turnstile';
import { safeRedirect } from '@/backend/shared/safe-redirect';

export type SignupResult = { ok: true; redirectUrl: string } | { ok: false; message: string };

export type LoginResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; message: string }
  | { needsOtp: true; email: string; password: string; redirectUrl: string };

export type VerifyOtpResult =
  | { ok: true; redirectUrl: string; consumedPendingLogin: boolean }
  | { ok: false; message: string };

export type SimpleResult = { ok: true; message?: string } | { ok: false; message: string };

export type OAuthResult = { ok: true; url: string } | { ok: false; message: string };

export class AuthService {
  async signup(
    supabase: SupabaseClient<Database>,
    admin: SupabaseClient<Database>,
    input: {
      name: string;
      email: string;
      password: string;
      redirectTo: string | null;
      turnstileToken: string;
    }
  ): Promise<SignupResult> {
    const parsed = SignupSchema.safeParse({
      name: input.name,
      email: input.email,
      password: input.password,
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'بيانات غير صحيحة' };
    }

    if (input.turnstileToken && !(await verifyTurnstileToken(input.turnstileToken))) {
      return { ok: false, message: 'فشل التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى' };
    }

    const signupRateOk = await checkRateLimit(`signup:${input.email}`, 3, 60 * 60 * 1000);
    if (!signupRateOk) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
    }

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { name: input.name } },
    });

    if (error) {
      return {
        ok: false,
        message:
          error.message === 'User already registered'
            ? 'البريد الإلكتروني مسجل مسبقاً'
            : error.message,
      };
    }

    if (signUpData.user?.id) {
      await admin
        .from('users')
        .upsert({
          id: signUpData.user.id,
          email: input.email,
          name: input.name,
          created_at: new Date().toISOString(),
        })
        .maybeSingle();
    }

    const otp = generateOtp();
    const { hash, salt } = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

    await createOtpRecord(input.email, hash, salt, expiresAt);
    try {
      await sendOtpEmail(input.email, otp);
    } catch {
      // Email delivery failure — OTP is created, user can still resend from verify page
    }

    const params = new URLSearchParams({ email: input.email });
    if (input.redirectTo) params.set('redirect', input.redirectTo);
    return { ok: true, redirectUrl: `/auth/verify-otp?${params.toString()}` };
  }

  async login(
    supabase: SupabaseClient<Database>,
    input: {
      email: string;
      password: string;
      redirectTo: string | null;
      turnstileToken: string;
    }
  ): Promise<LoginResult> {
    const parsed = LoginSchema.safeParse({ email: input.email, password: input.password });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'بيانات غير صحيحة' };
    }

    if (input.turnstileToken && !(await verifyTurnstileToken(input.turnstileToken))) {
      return { ok: false, message: 'فشل التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى' };
    }

    const loginRateOk = await checkRateLimit(`login:${input.email}`, 5, 60 * 1000);
    if (!loginRateOk) {
      return {
        ok: false,
        message: 'تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة',
      };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        const otp = generateOtp();
        const { hash, salt } = hashOtp(otp);
        const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

        await createOtpRecord(input.email, hash, salt, expiresAt);
        try {
          await sendOtpEmail(input.email, otp);
        } catch {
          // Email delivery failure — OTP is created, user can resend
        }

        const params = new URLSearchParams({ email: input.email });
        if (input.redirectTo) params.set('redirect', input.redirectTo);
        return {
          needsOtp: true,
          email: input.email,
          password: input.password,
          redirectUrl: `/auth/verify-otp?${params.toString()}`,
        };
      }
      return { ok: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
    }

    return { ok: true, redirectUrl: safeRedirect(input.redirectTo) };
  }

  async verifyOtp(
    supabase: SupabaseClient<Database>,
    admin: SupabaseClient<Database>,
    input: { email: string; otp: string; redirectTo: string | null; pendingPassword: string | null }
  ): Promise<VerifyOtpResult> {
    const result = await verifyOtpRecord(input.email, input.otp);

    if (result.error) {
      return { ok: false, message: result.error };
    }

    // Try session-first (signup flow — user already has unconfirmed session)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.email_confirmed_at === null) {
      await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
      return { ok: true, redirectUrl: safeRedirect(input.redirectTo), consumedPendingLogin: false };
    }

    const { data: usersData, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 10000,
    });
    let consumedPendingLogin = false;
    if (!listError && usersData) {
      const targetUser = usersData.users.find((u) => u.email === input.email);
      if (targetUser && targetUser.email_confirmed_at === null) {
        await admin.auth.admin.updateUserById(targetUser.id, { email_confirm: true });

        // Auto-sign-in if user came from login flow (has pending_login cookie)
        if (input.pendingPassword) {
          consumedPendingLogin = true;
          try {
            await supabase.auth.signInWithPassword({
              email: input.email,
              password: input.pendingPassword,
            });
          } catch {
            // Cookie expired or password changed — user will need to log in manually
          }
        }
      }
    }

    return { ok: true, redirectUrl: safeRedirect(input.redirectTo), consumedPendingLogin };
  }

  async resendOtp(input: { email: string }): Promise<SimpleResult> {
    const resendRateOk = await checkRateLimit(
      `resend:${input.email}`,
      1,
      OTP_CONFIG.RESEND_COOLDOWN_SECONDS * 1000
    );
    if (!resendRateOk) {
      return { ok: false, message: 'يرجى الانتظار قبل إعادة الإرسال' };
    }

    const otp = generateOtp();
    const { hash, salt } = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

    await createOtpRecord(input.email, hash, salt, expiresAt);
    try {
      await sendOtpEmail(input.email, otp);
    } catch {
      return { ok: false, message: 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقاً' };
    }

    return { ok: true, message: 'تم إعادة إرسال رمز التحقق' };
  }

  async resetPassword(
    supabase: SupabaseClient<Database>,
    input: { email: string }
  ): Promise<SimpleResult> {
    const resetRateOk = await checkRateLimit(`reset:${input.email}`, 3, 60 * 60 * 1000);
    if (!resetRateOk) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com';
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${siteUrl}/auth/update-password`,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني' };
  }

  async updatePassword(
    supabase: SupabaseClient<Database>,
    input: { password: string; confirmPassword: string }
  ): Promise<SimpleResult> {
    if (input.password !== input.confirmPassword) {
      return { ok: false, message: 'كلمة المرور غير متطابقة' };
    }

    const parsed = UpdatePasswordSchema.safeParse({ password: input.password });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'كلمة المرور غير صحيحة' };
    }

    const { error } = await supabase.auth.updateUser({ password: input.password });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
  }

  async logout(supabase: SupabaseClient<Database>): Promise<void> {
    await supabase.auth.signOut();
  }

  async signInWithOAuth(
    supabase: SupabaseClient<Database>,
    provider: 'google',
    redirectTo?: string
  ): Promise<OAuthResult> {
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

    if (error) {
      return { ok: false, message: error.message };
    }
    if (!data.url) {
      return { ok: false, message: 'تعذر بدء تسجيل الدخول عبر جوجل' };
    }
    return { ok: true, url: data.url };
  }
}

/** Composition root entry — one AuthService instance per request boundary. */
export function createAuthService(): AuthService {
  return new AuthService();
}
