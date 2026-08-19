import { Resend } from 'resend';
import { createEmailClient, type EmailClient } from '@/backend/clients/email';
import { OTP_CONFIG } from '@/backend/config/otp';
import { env } from '@/backend/config/env';

export const EMAIL_VALIDITY = {
  OTP_MINUTES: OTP_CONFIG.TTL_MINUTES,
  PASSWORD_RESET_HOURS: 1,
} as const;

const DEFAULT_FROM_NAME = 'رؤية رقمية';

let defaultEmailClient: EmailClient | null = null;

export function getDefaultEmailClient(): EmailClient {
  if (!defaultEmailClient) {
    defaultEmailClient = createEmailClient(
      new Resend(env.resendApiKey ?? ''),
      {
        fromName: env.resendFromName?.trim() || DEFAULT_FROM_NAME,
        fromEmail: env.resendFromEmail ?? '',
      },
      {
        otpMinutes: EMAIL_VALIDITY.OTP_MINUTES,
        passwordResetHours: EMAIL_VALIDITY.PASSWORD_RESET_HOURS,
      }
    );
  }
  return defaultEmailClient;
}

export function sendOtpEmail(email: string, otp: string): Promise<void> {
  return getDefaultEmailClient().sendOtpEmail(email, otp);
}

export function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  return getDefaultEmailClient().sendPasswordResetEmail(email, resetUrl);
}
