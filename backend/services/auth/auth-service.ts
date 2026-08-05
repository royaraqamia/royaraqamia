import {
  generateOtp,
  generateResetToken,
  hashOtp,
  verifyOtp,
} from '@/backend/shared/otp/generator';
import { LoginSchema, SignupSchema, UpdatePasswordSchema } from '@/shared/contracts/auth';
import { safeRedirect } from '@/backend/shared/safe-redirect';
import type { PendingLoginStore } from '@/backend/shared/auth/pending-login-store';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import type { OtpRepository } from '@/backend/repositories/otp/otp-repository';
import type { UserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import type { EmailClient } from '@/backend/clients/email';
import type { PasswordResetTokenRepository } from '@/backend/repositories/password-reset/password-reset-token-repository';
import type { RateLimiter } from '@/backend/clients/rate-limiter';

export type SignupResult = { ok: true; redirectUrl: string } | { ok: false; message: string };

export type LoginResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; message: string }
  | { needsOtp: true; email: string; redirectUrl: string };

export type VerifyOtpResult =
  | { ok: true; redirectUrl: string; consumedPendingLogin: boolean }
  | { ok: false; message: string };

export type SimpleResult = { ok: true; message?: string } | { ok: false; message: string };

export type UpdatePasswordResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; message: string };

export type OAuthResult = { ok: true; url: string } | { ok: false; message: string };

export interface AuthServiceDeps {
  otpRepository: OtpRepository;
  userProfileRepository: UserProfileRepository;
  passwordResetTokenRepository: PasswordResetTokenRepository;
  emailClient: EmailClient;
  rateLimiter: RateLimiter;
  verifyTurnstile: (token: string) => Promise<boolean>;
  pendingLoginStore: PendingLoginStore;
  otpTtlMinutes: number;
  otpResendCooldownSeconds: number;
  otpMaxAttempts: number;
  otpVerifyMaxPerMinute: number;
  passwordResetTokenTtlMinutes: number;
  siteUrl: string;
}

export class AuthService {
  private readonly otpRepository: OtpRepository;
  private readonly userProfileRepository: UserProfileRepository;
  private readonly passwordResetTokenRepository: PasswordResetTokenRepository;
  private readonly emailClient: EmailClient;
  private readonly rateLimiter: RateLimiter;
  private readonly verifyTurnstile: (token: string) => Promise<boolean>;
  private readonly pendingLoginStore: PendingLoginStore;
  private readonly otpTtlMinutes: number;
  private readonly otpResendCooldownSeconds: number;
  private readonly otpMaxAttempts: number;
  private readonly otpVerifyMaxPerMinute: number;
  private readonly passwordResetTokenTtlMinutes: number;
  private readonly siteUrl: string;

  constructor(
    private readonly gateway: AuthGateway,
    deps: AuthServiceDeps
  ) {
    this.otpRepository = deps.otpRepository;
    this.userProfileRepository = deps.userProfileRepository;
    this.passwordResetTokenRepository = deps.passwordResetTokenRepository;
    this.emailClient = deps.emailClient;
    this.rateLimiter = deps.rateLimiter;
    this.verifyTurnstile = deps.verifyTurnstile;
    this.pendingLoginStore = deps.pendingLoginStore;
    this.otpTtlMinutes = deps.otpTtlMinutes;
    this.otpResendCooldownSeconds = deps.otpResendCooldownSeconds;
    this.otpMaxAttempts = deps.otpMaxAttempts;
    this.otpVerifyMaxPerMinute = deps.otpVerifyMaxPerMinute;
    this.passwordResetTokenTtlMinutes = deps.passwordResetTokenTtlMinutes;
    this.siteUrl = deps.siteUrl;
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
      await this.userProfileRepository.upsert({
        id: user.id,
        email: input.email,
        name: input.name,
      });
    }

    const otp = generateOtp();
    const { hash, salt } = hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

    await this.otpRepository.createOtpRecord({
      email: input.email,
      otpHash: hash,
      salt,
      expiresAt,
      maxAttempts: this.otpMaxAttempts,
    });
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

        await this.otpRepository.createOtpRecord({
          email: input.email,
          otpHash: hash,
          salt,
          expiresAt,
          maxAttempts: this.otpMaxAttempts,
        });
        try {
          await this.emailClient.sendOtpEmail(input.email, otp);
        } catch {
          // Email delivery failure — OTP is created, user can resend
        }

        await this.pendingLoginStore.setPassword(input.password);

        const params = new URLSearchParams({ email: input.email });
        if (input.redirectTo) params.set('redirect', input.redirectTo);
        return {
          needsOtp: true,
          email: input.email,
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
  }): Promise<VerifyOtpResult> {
    const verifyRateOk = await this.rateLimiter.checkRateLimit(
      `verify:${input.email}`,
      this.otpVerifyMaxPerMinute,
      60 * 1000
    );
    if (!verifyRateOk) {
      return {
        ok: false,
        message: 'تم تجاوز عدد محاولات التحقق المسموح بها. يرجى المحاولة لاحقاً',
      };
    }

    const pendingPassword = await this.pendingLoginStore.readPassword();
    const record = await this.otpRepository.findLatestPendingOtp(input.email);

    if (!record) {
      return { ok: false, message: 'لم يتم العثور على رمز التحقق' };
    }

    if (record.expiresAt.getTime() < Date.now()) {
      return { ok: false, message: 'انتهت صلاحية رمز التحقق' };
    }

    if (record.attempts >= record.maxAttempts) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى لمحاولات التحقق' };
    }

    if (!verifyOtp(input.otp, record.otpHash, record.salt)) {
      await this.otpRepository.incrementOtpAttempts(record.id, record.attempts);
      return { ok: false, message: 'رمز التحقق غير صحيح' };
    }

    await this.otpRepository.markOtpVerified(record.id);

    // Try session-first (signup flow — user already has unconfirmed session).
    // Only confirm the session account if it is the account whose OTP is being
    // verified, otherwise a stale session for a different unconfirmed account
    // would be confirmed instead of the intended one.
    const { user } = await this.gateway.getUser();

    if (
      user &&
      user.email_confirmed_at === null &&
      user.email?.trim().toLowerCase() === input.email.trim().toLowerCase()
    ) {
      await this.gateway.confirmUserEmail(user.id);
      return { ok: true, redirectUrl: safeRedirect(input.redirectTo), consumedPendingLogin: false };
    }

    // Targeted lookup by email (login flow — no active session yet)
    const { user: targetUser } = await this.gateway.getUserByEmail(input.email);
    let consumedPendingLogin = false;

    if (targetUser && targetUser.email_confirmed_at === null) {
      await this.gateway.confirmUserEmail(targetUser.id);

      // Auto-sign-in if user came from login flow (has pending password)
      if (pendingPassword) {
        consumedPendingLogin = true;
        const { error: signInError } = await this.gateway.signInWithPassword({
          email: input.email,
          password: pendingPassword,
        });
        if (signInError) {
          // Password may have changed or pending store expired — user can log in manually
          consumedPendingLogin = false;
        }
      }
    }

    if (consumedPendingLogin) {
      await this.pendingLoginStore.clear();
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

    const existing = await this.otpRepository.findLatestPendingOtp(input.email);
    if (!existing) {
      return { ok: false, message: 'لا يوجد رمز تحقق نشط لهذا البريد الإلكتروني' };
    }

    const otp = generateOtp();
    const { hash, salt } = hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

    await this.otpRepository.createOtpRecord({
      email: input.email,
      otpHash: hash,
      salt,
      expiresAt,
      maxAttempts: this.otpMaxAttempts,
    });
    try {
      await this.emailClient.sendOtpEmail(input.email, otp);
    } catch {
      return { ok: false, message: 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقاً' };
    }

    return { ok: true, message: 'تم إعادة إرسال رمز التحقق' };
  }

  async resetPassword(input: { email: string; redirectTo?: string | null }): Promise<SimpleResult> {
    const resetRateOk = await this.rateLimiter.checkRateLimit(
      `reset:${input.email}`,
      3,
      60 * 60 * 1000
    );
    if (!resetRateOk) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
    }

    const { user } = await this.gateway.getUserByEmail(input.email);

    if (!user) {
      return {
        ok: true,
        message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني',
      };
    }

    const token = generateResetToken();
    const { hash, salt } = hashOtp(token);
    const expiresAt = new Date(Date.now() + this.passwordResetTokenTtlMinutes * 60 * 1000);

    await this.passwordResetTokenRepository.createToken({
      email: input.email,
      userId: user.id,
      tokenHash: hash,
      salt,
      expiresAt,
    });

    const redirectTo = safeRedirect(input.redirectTo ?? null);
    const resetUrl =
      `${this.siteUrl}/auth/update-password` +
      `?token=${encodeURIComponent(token)}` +
      `&email=${encodeURIComponent(input.email)}` +
      `&redirect=${encodeURIComponent(redirectTo)}`;

    try {
      await this.emailClient.sendPasswordResetEmail(input.email, resetUrl);
    } catch {
      // Email delivery failure — token is still created; user can request a new one
    }

    return {
      ok: true,
      message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني',
    };
  }

  async updatePassword(input: {
    password: string;
    confirmPassword: string;
    token: string;
    email: string;
    redirectTo: string | null;
  }): Promise<UpdatePasswordResult> {
    if (input.password !== input.confirmPassword) {
      return { ok: false, message: 'كلمة المرور غير متطابقة' };
    }

    const parsed = UpdatePasswordSchema.safeParse({ password: input.password });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'كلمة المرور غير صالحة' };
    }

    const verifyRateOk = await this.rateLimiter.checkRateLimit(
      `reset_verify:${input.email}`,
      10,
      60 * 1000
    );
    if (!verifyRateOk) {
      return {
        ok: false,
        message: 'تم تجاوز عدد محاولات التحقق المسموح بها. يرجى المحاولة لاحقاً',
      };
    }

    const record = await this.passwordResetTokenRepository.findLatestValidToken(input.email);

    if (!record) {
      return { ok: false, message: 'رمز إعادة تعيين كلمة المرور غير صالح' };
    }

    if (record.expiresAt.getTime() < Date.now()) {
      return { ok: false, message: 'انتهت صلاحية رابط إعادة تعيين كلمة المرور' };
    }

    if (record.usedAt) {
      return { ok: false, message: 'تم استخدام رابط إعادة تعيين كلمة المرور بالفعل' };
    }

    if (!verifyOtp(input.token, record.tokenHash, record.salt)) {
      return { ok: false, message: 'رمز إعادة تعيين كلمة المرور غير صالح' };
    }

    await this.passwordResetTokenRepository.markTokenAsUsed(record.id);

    const { error } = await this.gateway.updateUserPassword(record.userId, input.password);

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, redirectUrl: safeRedirect(input.redirectTo) };
  }

  async logout(): Promise<void> {
    await this.gateway.signOut();
  }

  async signInWithOAuth(provider: 'google', redirectTo?: string): Promise<OAuthResult> {
    const callbackUrl = new URL(`${this.siteUrl}/auth/callback`);
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
