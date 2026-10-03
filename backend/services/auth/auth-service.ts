import {
  generateOtp,
  generateResetToken,
  hashOtp,
  verifyOtp,
} from '@/backend/shared/otp/generator';
import { LoginSchema, SignupSchema, UpdatePasswordSchema } from '@/shared/contracts/auth';
import { safeRedirect } from '@/shared/safe-redirect';
import { normalizeEmail } from '@/shared/email';
import type { PendingLoginStore } from '@/backend/shared/auth/pending-login-store';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import type { OtpRepository } from '@/backend/repositories/otp/otp-repository';
import type { UserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import type { EmailClient } from '@/backend/clients/email';
import type { PasswordBreachChecker } from '@/backend/clients/password-breach';
import type { PasswordResetTokenRepository } from '@/backend/repositories/password-reset/password-reset-token-repository';
import type { RateLimiter } from '@/backend/clients/rate-limiter';

export type SignupResult = { ok: true; redirectUrl: string } | { ok: false; message: string };

export type LoginResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; message: string }
  | { needsOtp: true; email: string; redirectUrl: string };

export type VerifyOtpResult =
  { ok: true; redirectUrl: string; consumedPendingLogin: boolean } | { ok: false; message: string };

export type SimpleResult = { ok: true; message?: string } | { ok: false; message: string };

export type UpdatePasswordResult =
  { ok: true; redirectUrl: string } | { ok: false; message: string };

export type OAuthResult = { ok: true; url: string } | { ok: false; message: string };

const OTP_ATTEMPT_CAS_MAX_RETRIES = 3;

// Per-IP ceilings run alongside the per-email limits. They are deliberately
// looser than the per-email limits (shared NAT / offices), but they stop a
// distributed attacker from sidestepping the per-email buckets by rotating the
// target address or the casing of a single address.
const IP_RATE_LIMITS = {
  signup: { limit: 10, windowMs: 60 * 60 * 1000 },
  login: { limit: 30, windowMs: 60 * 1000 },
  verify: { limit: 30, windowMs: 60 * 1000 },
  resend: { limit: 5, windowMs: 60 * 1000 },
  reset: { limit: 10, windowMs: 60 * 60 * 1000 },
  update: { limit: 30, windowMs: 60 * 1000 },
} as const;

const BREACHED_PASSWORD_MESSAGE =
  'كلمة المرور هذه ظهرت في تسريبات بيانات معروفة. يرجى اختيار كلمة مرور أخرى.';

export interface AuthServiceDeps {
  otpRepository: OtpRepository;
  userProfileRepository: UserProfileRepository;
  passwordResetTokenRepository: PasswordResetTokenRepository;
  emailClient: EmailClient;
  rateLimiter: RateLimiter;
  passwordBreachChecker: PasswordBreachChecker;
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
  private readonly passwordBreachChecker: PasswordBreachChecker;
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
    this.passwordBreachChecker = deps.passwordBreachChecker;
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
    ipAddress?: string | null;
  }): Promise<SignupResult> {
    const email = normalizeEmail(input.email);
    const parsed = SignupSchema.safeParse({
      name: input.name,
      email,
      password: input.password,
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'بيانات غير صحيحة' };
    }

    if (!(await this.verifyTurnstile(input.turnstileToken))) {
      return { ok: false, message: 'فشل التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى' };
    }

    const signupRateOk = await this.rateLimiter.checkRateLimit(
      `signup:${email}`,
      3,
      60 * 60 * 1000
    );
    if (!signupRateOk) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
    }

    if (await this.isIpRateLimited('signup', input.ipAddress)) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
    }

    if (await this.passwordBreachChecker.isBreached(input.password)) {
      return { ok: false, message: BREACHED_PASSWORD_MESSAGE };
    }

    const { user, error, hasSession, existing } = await this.gateway.signUp({
      email,
      password: input.password,
      name: input.name,
    });

    // Supabase signals an already-registered email in two ways depending on its
    // config: an error ("User already registered") or an obfuscated user with no
    // identities. Treat both identically and neutrally so signup cannot be used
    // to enumerate accounts.
    const alreadyRegistered = existing || error?.message === 'User already registered';

    if (error && !alreadyRegistered) {
      return { ok: false, message: error.message };
    }

    if (alreadyRegistered) {
      // Never reveal that the email exists, and never send an OTP to an account
      // that did not request one. The owner gets sign-in / reset links by email,
      // and the caller gets the same success response as a brand-new signup.
      await this.notifyAccountExists(email, input.redirectTo);
      return this.pendingSignupResponse(email, input.redirectTo);
    }

    if (user?.id) {
      await this.userProfileRepository.upsert({
        id: user.id,
        email,
        name: input.name,
      });
    }

    const otp = generateOtp();
    const { hash, salt } = hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

    await this.otpRepository.createOtpRecord({
      email,
      otpHash: hash,
      salt,
      expiresAt,
      maxAttempts: this.otpMaxAttempts,
    });
    try {
      await this.emailClient.sendOtpEmail(email, otp);
    } catch {
      // Email delivery failure — OTP is created, user can still resend from verify page
    }

    // When email confirmation is enabled Supabase creates the account but no
    // session, so stash the password (encrypted, httpOnly, short TTL) for
    // verifyOtp to complete the sign-in once the account is confirmed.
    if (!hasSession) {
      await this.pendingLoginStore.setPassword(input.password);
    }

    return this.pendingSignupResponse(email, input.redirectTo);
  }

  async login(input: {
    email: string;
    password: string;
    redirectTo: string | null;
    turnstileToken: string;
    ipAddress?: string | null;
  }): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const parsed = LoginSchema.safeParse({ email, password: input.password });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'بيانات غير صحيحة' };
    }

    if (!(await this.verifyTurnstile(input.turnstileToken))) {
      return { ok: false, message: 'فشل التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى' };
    }

    const loginRateOk = await this.rateLimiter.checkRateLimit(`login:${email}`, 5, 60 * 1000);
    if (!loginRateOk) {
      return {
        ok: false,
        message: 'تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة',
      };
    }

    if (await this.isIpRateLimited('login', input.ipAddress)) {
      return {
        ok: false,
        message: 'تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة',
      };
    }

    const { error } = await this.gateway.signInWithPassword({
      email,
      password: input.password,
    });

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        const otp = generateOtp();
        const { hash, salt } = hashOtp(otp);
        const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

        await this.otpRepository.createOtpRecord({
          email,
          otpHash: hash,
          salt,
          expiresAt,
          maxAttempts: this.otpMaxAttempts,
        });
        try {
          await this.emailClient.sendOtpEmail(email, otp);
        } catch {
          // Email delivery failure — OTP is created, user can resend
        }

        await this.pendingLoginStore.setPassword(input.password);

        const params = new URLSearchParams({ email });
        if (input.redirectTo) params.set('redirect', input.redirectTo);
        return {
          needsOtp: true,
          email,
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
    ipAddress?: string | null;
  }): Promise<VerifyOtpResult> {
    const email = normalizeEmail(input.email);
    const verifyRateOk = await this.rateLimiter.checkRateLimit(
      `verify:${email}`,
      this.otpVerifyMaxPerMinute,
      60 * 1000
    );
    if (!verifyRateOk) {
      return {
        ok: false,
        message: 'تم تجاوز عدد محاولات التحقق المسموح بها. يرجى المحاولة لاحقاً',
      };
    }

    if (await this.isIpRateLimited('verify', input.ipAddress)) {
      return {
        ok: false,
        message: 'تم تجاوز عدد محاولات التحقق المسموح بها. يرجى المحاولة لاحقاً',
      };
    }

    const record = await this.otpRepository.findLatestPendingOtp(email);

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
      await this.countFailedOtpAttempt(email, record.id, record.attempts);
      return { ok: false, message: 'رمز التحقق غير صحيح' };
    }

    await this.otpRepository.markOtpVerified(record.id);

    const pendingPassword = await this.pendingLoginStore.readPassword();

    // Try session-first (signup flow — user already has unconfirmed session).
    // Only confirm the session account if it is the account whose OTP is being
    // verified, otherwise a stale session for a different unconfirmed account
    // would be confirmed instead of the intended one.
    const { user } = await this.gateway.getUser();

    if (user && user.email_confirmed_at === null && normalizeEmail(user.email) === email) {
      await this.gateway.confirmUserEmail(user.id);
      if (pendingPassword) {
        await this.pendingLoginStore.clear();
      }
      return { ok: true, redirectUrl: safeRedirect(input.redirectTo), consumedPendingLogin: false };
    }

    // Targeted lookup by email (login/signup flow without an active session)
    const { user: targetUser } = await this.gateway.getUserByEmail(email);
    let consumedPendingLogin = false;

    if (targetUser && targetUser.email_confirmed_at === null) {
      await this.gateway.confirmUserEmail(targetUser.id);

      // Auto-sign-in when this flow stashed a pending password (login with an
      // unconfirmed account, or signup with email confirmation enabled).
      if (pendingPassword) {
        const { error: signInError } = await this.gateway.signInWithPassword({
          email,
          password: pendingPassword,
        });
        consumedPendingLogin = !signInError;
      }
    }

    // Once the OTP is verified the stashed credential must not linger, whether
    // or not the auto sign-in succeeded (a changed password means the user logs
    // in manually instead).
    if (pendingPassword) {
      await this.pendingLoginStore.clear();
    }

    return { ok: true, redirectUrl: safeRedirect(input.redirectTo), consumedPendingLogin };
  }

  async resendOtp(input: { email: string; ipAddress?: string | null }): Promise<SimpleResult> {
    const email = normalizeEmail(input.email);
    const resendRateOk = await this.rateLimiter.checkRateLimit(
      `resend:${email}`,
      1,
      this.otpResendCooldownSeconds * 1000
    );
    if (!resendRateOk) {
      return { ok: false, message: 'يرجى الانتظار قبل إعادة الإرسال' };
    }

    if (await this.isIpRateLimited('resend', input.ipAddress)) {
      return { ok: false, message: 'يرجى الانتظار قبل إعادة الإرسال' };
    }

    const existing = await this.otpRepository.findLatestPendingOtp(email);
    if (!existing) {
      return { ok: false, message: 'لا يوجد رمز تحقق نشط لهذا البريد الإلكتروني' };
    }

    const otp = generateOtp();
    const { hash, salt } = hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

    await this.otpRepository.createOtpRecord({
      email,
      otpHash: hash,
      salt,
      expiresAt,
      maxAttempts: this.otpMaxAttempts,
    });
    try {
      await this.emailClient.sendOtpEmail(email, otp);
    } catch {
      return { ok: false, message: 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقاً' };
    }

    return { ok: true, message: 'تم إعادة إرسال رمز التحقق' };
  }

  async resetPassword(input: {
    email: string;
    redirectTo?: string | null;
    ipAddress?: string | null;
  }): Promise<SimpleResult> {
    const email = normalizeEmail(input.email);
    const resetRateOk = await this.rateLimiter.checkRateLimit(`reset:${email}`, 3, 60 * 60 * 1000);
    if (!resetRateOk) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
    }

    if (await this.isIpRateLimited('reset', input.ipAddress)) {
      return { ok: false, message: 'تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة لاحقاً' };
    }

    const { user } = await this.gateway.getUserByEmail(email);

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
      email,
      userId: user.id,
      tokenHash: hash,
      salt,
      expiresAt,
    });

    const redirectTo = safeRedirect(input.redirectTo ?? null);
    const resetUrl =
      `${this.siteUrl}/auth/update-password` +
      `?token=${encodeURIComponent(token)}` +
      `&email=${encodeURIComponent(email)}` +
      `&redirect=${encodeURIComponent(redirectTo)}`;

    try {
      await this.emailClient.sendPasswordResetEmail(email, resetUrl);
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
    ipAddress?: string | null;
  }): Promise<UpdatePasswordResult> {
    if (input.password !== input.confirmPassword) {
      return { ok: false, message: 'كلمة المرور غير متطابقة' };
    }

    const parsed = UpdatePasswordSchema.safeParse({ password: input.password });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message || 'كلمة المرور غير صالحة' };
    }

    const email = normalizeEmail(input.email);
    const verifyRateOk = await this.rateLimiter.checkRateLimit(
      `reset_verify:${email}`,
      10,
      60 * 1000
    );
    if (!verifyRateOk) {
      return {
        ok: false,
        message: 'تم تجاوز عدد محاولات التحقق المسموح بها. يرجى المحاولة لاحقاً',
      };
    }

    if (await this.isIpRateLimited('update', input.ipAddress)) {
      return {
        ok: false,
        message: 'تم تجاوز عدد محاولات التحقق المسموح بها. يرجى المحاولة لاحقاً',
      };
    }

    if (await this.passwordBreachChecker.isBreached(input.password)) {
      return { ok: false, message: BREACHED_PASSWORD_MESSAGE };
    }

    const record = await this.passwordResetTokenRepository.findLatestValidToken(email);

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

  /**
   * Applies the per-IP ceiling for a scope. Returns false when no IP is
   * available (e.g. internal callers), so the per-email limits still apply.
   */
  private async isIpRateLimited(
    scope: keyof typeof IP_RATE_LIMITS,
    ipAddress: string | null | undefined
  ): Promise<boolean> {
    if (!ipAddress) return false;
    const { limit, windowMs } = IP_RATE_LIMITS[scope];
    const allowed = await this.rateLimiter.checkRateLimit(
      `${scope}_ip:${ipAddress}`,
      limit,
      windowMs
    );
    return !allowed;
  }

  /**
   * Anti-enumeration: when someone requests a signup for an address that already
   * exists, send the account owner a neutral "sign in instead" email. The caller
   * always sees the same response as a fresh signup, so the endpoint cannot be
   * used to discover which emails are registered.
   */
  private async notifyAccountExists(email: string, redirectTo: string | null): Promise<void> {
    const redirect = safeRedirect(redirectTo);
    const query = redirect === '/' ? '' : `?redirect=${encodeURIComponent(redirect)}`;
    try {
      await this.emailClient.sendAccountExistsEmail(email, {
        loginUrl: `${this.siteUrl}/auth/login${query}`,
        resetUrl: `${this.siteUrl}/auth/reset-password${query}`,
      });
    } catch {
      // Best-effort: never surface the delivery outcome to the caller.
    }
  }

  private pendingSignupResponse(email: string, redirectTo: string | null): SignupResult {
    const params = new URLSearchParams({ email });
    if (redirectTo) params.set('redirect', redirectTo);
    return { ok: true, redirectUrl: `/auth/verify-otp?${params.toString()}` };
  }

  /**
   * Records a failed verification attempt via the repository's atomic
   * compare-and-swap, re-reading and retrying under contention so no wrong
   * guess escapes the brute-force counter.
   */
  private async countFailedOtpAttempt(
    email: string,
    otpId: string,
    knownAttempts: number
  ): Promise<void> {
    let attempts = knownAttempts;
    for (let retry = 0; retry < OTP_ATTEMPT_CAS_MAX_RETRIES; retry += 1) {
      if (await this.otpRepository.incrementOtpAttempts(otpId, attempts)) return;
      const fresh = await this.otpRepository.findLatestPendingOtp(email);
      if (!fresh || fresh.id !== otpId) return;
      attempts = fresh.attempts;
    }
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
