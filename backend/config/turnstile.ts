import { verifyTurnstileToken } from '@/backend/clients/turnstile';

/**
 * يربط التحقق من Turnstile بالسر المُهيّأ.
 * - عند عدم تهيئة السر: يتم تخطّي التحقق (تدهور سلس في التطوير/الاختبار).
 * - عند تهيئة السر: رمز فارغ أو مفقود يُرفض دائماً (fail-closed)، وإلا أمكن
 *   تجاوز الحماية بإرسال الطلب دون رمز.
 */
export function createTurnstileVerifier(secret: string | undefined) {
  return (token: string): Promise<boolean> => {
    if (!secret) return Promise.resolve(true);
    if (!token) return Promise.resolve(false);
    return verifyTurnstileToken(token, secret);
  };
}
