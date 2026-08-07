import { z } from 'zod';

export const PostSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  slug: z
    .string()
    .min(1, 'الرابط مطلوب')
    .regex(/^[\w\u0600-\u06FF-]+$/, 'الرابط يجب أن يحتوي على أحرف وأرقام وشرطات فقط'),
  content: z.string().optional(),
  cover_image: z.string().optional(),
  meta_title: z.string().max(70).optional(),
  meta_desc: z.string().max(160).optional(),
  status: z.enum(['draft', 'published', 'scheduled']).optional(),
  publish_at: z.string().nullable().optional(),
});

export type PostInput = z.infer<typeof PostSchema>;

export const TagInputSchema = z.object({
  name: z.string().trim().min(1, 'اسم الوسم مطلوب').max(30, 'الاسم طويل جداً'),
  slug: z
    .string()
    .trim()
    .min(1, 'رابط الوسم مطلوب')
    .max(60, 'الرابط طويل جداً')
    .regex(/^[\w\u0600-\u06FF-]+$/, 'الرابط يجب أن يحتوي على أحرف وأرقام وشرطات فقط'),
});

export type TagInput = z.infer<typeof TagInputSchema>;

export const PostTagIdsSchema = z.object({
  tagIds: z.array(z.string().uuid('معرّف وسم غير صالح')).max(10, 'الحد الأقصى 10 وسوم'),
});

export type PostTagIdsInput = z.infer<typeof PostTagIdsSchema>;
