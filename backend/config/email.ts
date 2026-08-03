import { Resend } from 'resend';
import { createEmailClient, type EmailClient } from '@/backend/clients/email';
import { env } from '@/backend/config/env';

let defaultEmailClient: EmailClient | null = null;

export function getDefaultEmailClient(): EmailClient {
  if (!defaultEmailClient) {
    defaultEmailClient = createEmailClient(new Resend(env.resendApiKey ?? ''), {
      fromName: env.resendFromName ?? '',
      fromEmail: env.resendFromEmail ?? '',
    });
  }
  return defaultEmailClient;
}

export function sendOtpEmail(email: string, otp: string): Promise<void> {
  return getDefaultEmailClient().sendOtpEmail(email, otp);
}

export function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  return getDefaultEmailClient().sendPasswordResetEmail(email, resetUrl);
}
