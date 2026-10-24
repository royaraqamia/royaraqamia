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
  /** Offline write contract (ADR-0029): client-minted ids and logical write time. */
  id: z.string().uuid('معرِّف منشور غير صالح').optional(),
  clientId: z.string().uuid('معرِّف منشور غير صالح').optional(),
  updatedAt: z.string().optional(),
});

export type PostInput = z.infer<typeof PostSchema>;

/**
 * The publication state a client may request on create. `published_at` and
 * `community_visible` are server-owned and are never part of this contract.
 */
export type PostStatusInput = NonNullable<PostInput['status']>;

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

/** Upper bound on one bulk request, so a malformed client cannot fan out an unbounded batch. */
export const BULK_POSTS_MAX = 100;

export const BulkPostsActionSchema = z.object({
  action: z.enum(['publish', 'unpublish', 'delete', 'setCategory']),
  postIds: z
    .array(z.string().uuid('معرِّف منشور غير صالح'))
    .min(1, 'اختر منشوراً واحداً على الأقل')
    .max(BULK_POSTS_MAX, `الحد الأقصى ${BULK_POSTS_MAX} منشور`)
    .transform((ids) => Array.from(new Set(ids))),
  categoryId: z.string().uuid('معرِّف تصنيف غير صالح').nullable().optional(),
});

export type BulkPostsActionInput = z.infer<typeof BulkPostsActionSchema>;

export const SchedulePostSchema = z.object({
  publish_at: z.string().min(1, 'تاريخ النشر مطلوب'),
});

export type SchedulePostInput = z.infer<typeof SchedulePostSchema>;

/**
 * Longest accepted public community query. Both the anonymous suggestions
 * endpoint and the cached feed route are public, so the bound stops an overlong
 * string from driving an arbitrarily large trigram scan and, on the feed, from
 * becoming part of the `unstable_cache` key.
 */
export const COMMUNITY_SEARCH_QUERY_MAX_LENGTH = 80;

/** Longest accepted opaque feed cursor; a real one is ~90 base64url characters. */
export const COMMUNITY_INDEX_CURSOR_MAX_LENGTH = 200;

const CommunityQuerySchema = z
  .string()
  .trim()
  .max(
    COMMUNITY_SEARCH_QUERY_MAX_LENGTH,
    `عبارة البحث طويلة جداً: الحدّ الأقصى ${COMMUNITY_SEARCH_QUERY_MAX_LENGTH} حرفًا.`
  );

/**
 * A blank `q` is valid and means "no search" — the search route short-circuits
 * it to an empty result without touching the database; a real query is 1..80
 * characters after trimming.
 */
export const CommunitySearchQuerySchema = z.object({
  q: CommunityQuerySchema,
});

export type CommunitySearchQuery = z.infer<typeof CommunitySearchQuerySchema>;

export const CommunityIndexQuerySchema = z.object({
  q: CommunityQuerySchema,
  cursor: z
    .string()
    .trim()
    .max(COMMUNITY_INDEX_CURSOR_MAX_LENGTH, 'مرجع التصفّح غير صالح.')
    .nullable()
    // A blank cursor is the first page; normalise it so both spellings share one
    // cache key instead of seeding a second entry for the same page.
    .transform((value) => value || null),
});

export type CommunityIndexQuery = z.infer<typeof CommunityIndexQuerySchema>;

/** Combined people + posts result for the community search combobox. */
export interface CommunitySearchResult {
  people: PublicUser[];
  posts: PostSummary[];
}
