import { verifyTurnstileToken } from '@/backend/clients/turnstile';

/**
 * يربط التحقق من Turnstile بالسر المُهيّأ.
 * عندما لا يوجد سر مُهيّأ، يتم تخطّي التحقق (تدهور سلس).
 */
export function createTurnstileVerifier(secret: string | undefined) {
  return (token: string): Promise<boolean> =>
    secret ? verifyTurnstileToken(token, secret) : Promise.resolve(true);
}
