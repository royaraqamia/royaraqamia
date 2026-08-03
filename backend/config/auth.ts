import { AuthService, type AuthServiceDeps } from '@/backend/services/auth/auth-service';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import { createSupabaseAuthGateway } from '@/backend/clients/supabase-auth-gateway';
import { createClient } from '@/backend/transport/supabase/server';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { OTP_CONFIG } from '@/backend/config/otp';
import { SupabaseOtpRepository } from '@/backend/repositories/otp/supabase-otp-repository';
import { sendOtpEmail, sendPasswordResetEmail } from '@/backend/config/email';
import { checkRateLimit, getRateLimitRemaining } from '@/backend/config/rate-limiter';
import { verifyTurnstileToken } from '@/backend/clients/turnstile';
import { env } from '@/backend/config/env';
import { createCookiePendingLoginStore } from '@/backend/transport/cookies';

export async function createServerAuthService(): Promise<AuthService> {
  return createAuthService(createSupabaseAuthGateway(await createClient(), getAdminSupabase()));
}

export function createAuthService(
  gateway: AuthGateway,
  deps: Partial<AuthServiceDeps> = {}
): AuthService {
  return new AuthService(gateway, {
    otpRepository: new SupabaseOtpRepository(),
    emailClient: {
      sendOtpEmail,
      sendPasswordResetEmail,
    },
    rateLimiter: {
      checkRateLimit,
      getRateLimitRemaining,
    },
    verifyTurnstile: (token: string) => verifyTurnstileToken(token, env.turnstileSecret),
    pendingLoginStore: createCookiePendingLoginStore(),
    otpTtlMinutes: OTP_CONFIG.TTL_MINUTES,
    otpResendCooldownSeconds: OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
    otpMaxAttempts: OTP_CONFIG.MAX_ATTEMPTS,
    siteUrl: env.siteUrl,
    ...deps,
  });
}
