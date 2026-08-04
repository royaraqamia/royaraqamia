import { AuthService, type AuthServiceDeps } from '@/backend/services/auth/auth-service';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import { createSupabaseAuthGateway } from '@/backend/clients/supabase-auth-gateway';
import { createServerSupabaseClient, getAdminSupabase } from '@/backend/config/supabase';
import { OTP_CONFIG } from '@/backend/config/otp';
import { SupabaseOtpRepository } from '@/backend/repositories/otp/supabase-otp-repository';
import { createUserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import { sendOtpEmail, sendPasswordResetEmail } from '@/backend/config/email';
import { checkRateLimit, getRateLimitRemaining } from '@/backend/config/rate-limiter';
import { createTurnstileVerifier } from '@/backend/config/turnstile';
import { env } from '@/backend/config/env';
import { createCookiePendingLoginStore } from '@/backend/transport/cookies';

export async function createServerAuthService(): Promise<AuthService> {
  return createAuthService(createSupabaseAuthGateway(await createServerSupabaseClient(), getAdminSupabase()), {
    otpRepository: new SupabaseOtpRepository(getAdminSupabase()),
  });
}

export function createAuthService(
  gateway: AuthGateway,
  deps: Partial<AuthServiceDeps> = {}
): AuthService {
  return new AuthService(gateway, {
    otpRepository: new SupabaseOtpRepository(getAdminSupabase()),
    userProfileRepository: createUserProfileRepository(getAdminSupabase()),
    emailClient: {
      sendOtpEmail,
      sendPasswordResetEmail,
    },
    rateLimiter: {
      checkRateLimit,
      getRateLimitRemaining,
    },
    verifyTurnstile: createTurnstileVerifier(env.turnstileSecret),
    pendingLoginStore: createCookiePendingLoginStore(),
    otpTtlMinutes: OTP_CONFIG.TTL_MINUTES,
    otpResendCooldownSeconds: OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
    otpMaxAttempts: OTP_CONFIG.MAX_ATTEMPTS,
    otpVerifyMaxPerMinute: OTP_CONFIG.VERIFY_MAX_PER_MINUTE,
    siteUrl: env.siteUrl,
    ...deps,
  });
}
