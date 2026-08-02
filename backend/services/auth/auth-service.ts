import { generateOtp, hashOtp } from '@/backend/shared/otp/generator';
import { LoginSchema, SignupSchema, UpdatePasswordSchema } from '@/shared/contracts/auth';
import { safeRedirect } from '@/backend/shared/safe-redirect';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import type { IOtpRepository } from '@/backend/repositories/otp/otp-repository';
import type { EmailClient } from '@/backend/clients/email';
import type { RateLimiter } from '@/backend/clients/rate-limiter';

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

export interface AuthServiceDeps {
  otpRepository: IOtpRepository;
  emailClient: EmailClient;
  rateLimiter: RateLimiter;
  verifyTurnstile: (token: string) => Promise<boolean>;
  otpTtlMinutes: number;
  otpResendCooldownSeconds: number;
}

export class AuthService {
  private readonly otpRepository: IOtpRepository;
  private readonly emailClient: EmailClient;
  private readonly rateLimiter: RateLimiter;
  private readonly verifyTurnstile: (token: string) => Promise<boolean>;
  private readonly otpTtlMinutes: number;
  private readonly otpResendCooldownSeconds: number;

  constructor(
    private readonly gateway: AuthGateway,
    deps: AuthServiceDeps
  ) {
    this.otpRepository = deps.otpRepository;
    this.emailClient = deps.emailClient;
    this.rateLimiter = deps.rateLimiter;
    this.verifyTurnstile = deps.verifyTurnstile;
    this.otpTtlMinutes = deps.otpTtlMinutes;
    this.otpResendCooldownSeconds = deps.otpResendCooldownSeconds;
  }

  async signup(input: {
    name: string;
    email: string;
    password: string;
    redirectTo: string | null;
    turnstileToken: string;
  }): Promise<SignupResult> {
    const parsed = SignupSchema.safeParse({
      name: input.name,
      email: input.email,
      password: input.password,
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'بيانات غير صحيحة' };
    }

    if (input.turnstileToken && !(await this.verifyTurnstile(input.turnstileToken))) {
      return { ok: false, message: 'فشل التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى' };
    }

    const signupRateOk = await this.rateLimiter.checkRateLimit(
      `signup:${input.email}`,
      3,
      60 * 60 * 1000
    );
    if (!signupRateOk) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
    }

    const { user, error } = await this.gateway.signUp({
      email: input.email,
      password: input.password,
      name: input.name,
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

    if (user?.id) {
      await this.gateway.upsertUserProfile({
        id: user.id,
        email: input.email,
        name: input.name,
      });
    }

    const otp = generateOtp();
    const { hash, salt } = hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

    await this.otpRepository.createOtpRecord(input.email, hash, salt, expiresAt);
    try {
      await this.emailClient.sendOtpEmail(input.email, otp);
    } catch {
      // Email delivery failure — OTP is created, user can still resend from verify page
    }

    const params = new URLSearchParams({ email: input.email });
    if (input.redirectTo) params.set('redirect', input.redirectTo);
    return { ok: true, redirectUrl: `/auth/verify-otp?${params.toString()}` };
  }

  async login(input: {
    email: string;
    password: string;
    redirectTo: string | null;
    turnstileToken: string;
  }): Promise<LoginResult> {
    const parsed = LoginSchema.safeParse({ email: input.email, password: input.password });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'بيانات غير صحيحة' };
    }

    if (input.turnstileToken && !(await this.verifyTurnstile(input.turnstileToken))) {
      return { ok: false, message: 'فشل التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى' };
    }

    const loginRateOk = await this.rateLimiter.checkRateLimit(`login:${input.email}`, 5, 60 * 1000);
    if (!loginRateOk) {
      return {
        ok: false,
        message: 'تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة',
      };
    }

    const { error } = await this.gateway.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        const otp = generateOtp();
        const { hash, salt } = hashOtp(otp);
        const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

        await this.otpRepository.createOtpRecord(input.email, hash, salt, expiresAt);
        try {
          await this.emailClient.sendOtpEmail(input.email, otp);
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

  async verifyOtp(input: {
    email: string;
    otp: string;
    redirectTo: string | null;
    pendingPassword: string | null;
  }): Promise<VerifyOtpResult> {
    const result = await this.otpRepository.verifyOtpRecord(input.email, input.otp);

    if (result.error) {
      return { ok: false, message: result.error };
    }

    // Try session-first (signup flow — user already has unconfirmed session)
    const { user } = await this.gateway.getUser();

    if (user && user.email_confirmed_at === null) {
      await this.gateway.confirmUserEmail(user.id);
      return { ok: true, redirectUrl: safeRedirect(input.redirectTo), consumedPendingLogin: false };
    }

    const { users, error: listError } = await this.gateway.listUsers();
    let consumedPendingLogin = false;
    if (!listError && users) {
      const targetUser = users.find((u) => u.email === input.email);
      if (targetUser && targetUser.email_confirmed_at === null) {
        await this.gateway.confirmUserEmail(targetUser.id);

        // Auto-sign-in if user came from login flow (has pending_login cookie)
        if (input.pendingPassword) {
          consumedPendingLogin = true;
          try {
            await this.gateway.signInWithPassword({
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
    const resendRateOk = await this.rateLimiter.checkRateLimit(
      `resend:${input.email}`,
      1,
      this.otpResendCooldownSeconds * 1000
    );
    if (!resendRateOk) {
      return { ok: false, message: 'يرجى الانتظار قبل إعادة الإرسال' };
    }

    const otp = generateOtp();
    const { hash, salt } = hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

    await this.otpRepository.createOtpRecord(input.email, hash, salt, expiresAt);
    try {
      await this.emailClient.sendOtpEmail(input.email, otp);
    } catch {
      return { ok: false, message: 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقاً' };
    }

    return { ok: true, message: 'تم إعادة إرسال رمز التحقق' };
  }

  async resetPassword(input: { email: string }): Promise<SimpleResult> {
    const resetRateOk = await this.rateLimiter.checkRateLimit(
      `reset:${input.email}`,
      3,
      60 * 60 * 1000
    );
    if (!resetRateOk) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com';
    const { error } = await this.gateway.resetPasswordForEmail(
      input.email,
      `${siteUrl}/auth/update-password`
    );

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني' };
  }

  async updatePassword(input: {
    password: string;
    confirmPassword: string;
  }): Promise<SimpleResult> {
    if (input.password !== input.confirmPassword) {
      return { ok: false, message: 'كلمة المرور غير متطابقة' };
    }

    const parsed = UpdatePasswordSchema.safeParse({ password: input.password });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'كلمة المرور غير صحيحة' };
    }

    const { error } = await this.gateway.updateUser({ password: input.password });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
  }

  async logout(): Promise<void> {
    await this.gateway.signOut();
  }

  async signInWithOAuth(provider: 'google', redirectTo?: string): Promise<OAuthResult> {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com';

    const callbackUrl = new URL(`${siteUrl}/auth/callback`);
    const safeNext = safeRedirect(redirectTo);
    if (safeNext !== '/') {
      callbackUrl.searchParams.set('next', safeNext);
    }

    const { url, error } = await this.gateway.signInWithOAuth(provider, callbackUrl.toString());

    if (error) {
      return { ok: false, message: error.message };
    }
    if (!url) {
      return { ok: false, message: 'تعذر بدء تسجيل الدخول عبر جوجل' };
    }
    return { ok: true, url };
  }
}
