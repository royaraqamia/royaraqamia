import { verifyTurnstileToken } from '@/backend/clients/turnstile';

/**
 * Wires Turnstile verification with the configured secret.
 * When no secret is configured, verification is skipped (graceful degradation).
 */
export function createTurnstileVerifier(secret: string | undefined) {
  return (token: string): Promise<boolean> =>
    secret ? verifyTurnstileToken(token, secret) : Promise.resolve(true);
}
