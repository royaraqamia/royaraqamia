import { z } from 'zod';
import type { PostSummary } from '@/shared/contracts/blogpress';
import type { PublicUser } from '@/shared/contracts/users';

export const PostSchema = z.object({
  slug: z
    .string()
    .min(1, 'الرَّابط مطلوب')
    .regex(/^[\w\u0600-\u06FF-]+$/, 'الرَّابط يجب أن يحتوي على أحرف وأرقام وشرطات فقط'),
  content: z.string().optional(),
  cover_image: z.string().optional(),
  meta_title: z.string().max(70).optional(),
  meta_desc: z.string().max(160).optional(),
  status: z.enum(['draft', 'published', 'scheduled']).optional(),
  publish_at: z.string().nullable().optional(),
});

export type PostInput = z.infer<typeof PostSchema>;

/** Public community post slug, validated before it is used in a view-count request. */
export const PostSlugSchema = z
  .string()
  .trim()
  .min(1, 'الرَّابط مطلوب')
  .max(200, 'الرَّابط طويل جداً')
  .regex(/^[\w\u0600-\u06FF-]+$/, 'الرَّابط يجب أن يحتوي على أحرف وأرقام وشرطات فقط');

export type PostSlug = z.infer<typeof PostSlugSchema>;

export const TagInputSchema = z.object({
  name: z.string().trim().min(1, 'اسم الوسم مطلوب').max(30, 'الاسم طويل جداً'),
  slug: z
    .string()
    .trim()
    .min(1, 'رابط الوسم مطلوب')
    .max(60, 'الرَّابط طويل جداً')
    .regex(/^[\w\u0600-\u06FF-]+$/, 'الرَّابط يجب أن يحتوي على أحرف وأرقام وشرطات فقط'),
});

export type TagInput = z.infer<typeof TagInputSchema>;

export const PostTagIdsSchema = z.object({
  tagIds: z.array(z.string().uuid('معرِّف وسم غير صالح')).max(10, 'الحد الأقصى 10 وسوم'),
});

export type PostTagIdsInput = z.infer<typeof PostTagIdsSchema>;

export const BulkPostsActionSchema = z.object({
  action: z.enum(['publish', 'unpublish', 'delete', 'setCategory']),
  postIds: z
    .array(z.string().uuid('معرِّف منشور غير صالح'))
    .min(1, 'اختر منشوراً واحداً على الأقل'),
  categoryId: z.string().uuid('معرِّف تصنيف غير صالح').nullable().optional(),
});

export type BulkPostsActionInput = z.infer<typeof BulkPostsActionSchema>;

export const SchedulePostSchema = z.object({
  publish_at: z.string().min(1, 'تاريخ النشر مطلوب'),
});

export type SchedulePostInput = z.infer<typeof SchedulePostSchema>;

/** Combined people + posts result for the community search combobox. */
export interface CommunitySearchResult {
  people: PublicUser[];
  posts: PostSummary[];
}
