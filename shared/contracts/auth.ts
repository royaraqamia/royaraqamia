import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صحيح'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
});

export const SignupSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  email: z.string().email('البريد الإلكتروني غير صحيح'),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[a-z]/, 'كلمة المرور يجب أن تحتوي على حرف صغير')
    .regex(/[A-Z]/, 'كلمة المرور يجب أن تحتوي على حرف كبير')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على رقم')
    .regex(/[^A-Za-z0-9]/, 'كلمة المرور يجب أن تحتوي على رمز خاص'),
});

export const UpdatePasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[a-z]/, 'كلمة المرور يجب أن تحتوي على حرف صغير')
    .regex(/[A-Z]/, 'كلمة المرور يجب أن تحتوي على حرف كبير')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على رقم')
    .regex(/[^A-Za-z0-9]/, 'كلمة المرور يجب أن تحتوي على رمز خاص'),
});

/**
 * Where Google's consent screen returns to when the flow was started inside the
 * Android shell.
 *
 * It has to be the app's own scheme rather than a path on the site: the consent
 * screen runs in the system browser, which has its own cookie jar, so the PKCE
 * verifier and the session cookie would end up in the wrong one. The system
 * browser cannot open a custom scheme, hands it to the app, and the app reloads
 * the equivalent https URL inside its WebView, where the exchange belongs.
 *
 * Three places must agree on this string, and none of them can import the other:
 * `frontend/shared/native-shell.ts`, the intent filter in
 * `android/app/src/main/AndroidManifest.xml`, and Supabase's redirect allowlist.
 */
export const NATIVE_OAUTH_CALLBACK_URL = 'royar://auth/callback';
