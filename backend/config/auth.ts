import { AuthService, type AuthServiceDeps } from '@/backend/services/auth/auth-service';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import { OTP_CONFIG } from '@/backend/config/otp';
import { SupabaseOtpRepository } from '@/backend/repositories/otp/supabase-otp-repository';
import { sendOtpEmail, sendPasswordResetEmail } from '@/backend/clients/email';
import { checkRateLimit, getRateLimitRemaining } from '@/backend/clients/rate-limiter';
import { verifyTurnstileToken } from '@/backend/clients/turnstile';

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
    verifyTurnstile: verifyTurnstileToken,
    otpTtlMinutes: OTP_CONFIG.TTL_MINUTES,
    otpResendCooldownSeconds: OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
    otpMaxAttempts: OTP_CONFIG.MAX_ATTEMPTS,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com',
    ...deps,
  });
}
