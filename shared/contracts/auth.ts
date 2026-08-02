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
    .regex(/[A-Z]/, 'كلمة المرور يجب أن تحتوي على حرف كبير')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على رقم')
    .regex(/[^A-Za-z0-9]/, 'كلمة المرور يجب أن تحتوي على رمز خاص'),
});

export const OtpSchema = z.object({
  otp: z.string().length(6, 'رمز التحقق يجب أن يكون 6 أرقام'),
});

export const ResetPasswordSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صحيح'),
});

export const UpdatePasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Z]/, 'كلمة المرور يجب أن تحتوي على حرف كبير')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على رقم')
    .regex(/[^A-Za-z0-9]/, 'كلمة المرور يجب أن تحتوي على رمز خاص'),
});
