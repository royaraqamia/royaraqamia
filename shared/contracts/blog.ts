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
});

export type PostInput = z.infer<typeof PostSchema>;
