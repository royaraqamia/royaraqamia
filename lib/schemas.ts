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

export const ResendOtpSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صحيح'),
});

export const ResetSchema = z.object({
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

export type LoginInput = z.infer<typeof LoginSchema>;
export type SignupInput = z.infer<typeof SignupSchema>;
export type OtpInput = z.infer<typeof OtpSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export const PostSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  slug: z.string().min(1, 'الرابط مطلوب'),
  content: z.string().optional(),
  cover_image: z.string().optional(),
  meta_title: z.string().max(70).optional(),
  meta_desc: z.string().max(160).optional(),
});

export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>;
export type PostInput = z.infer<typeof PostSchema>;
