import { z } from 'zod';
import type { PostSummary } from '@/shared/contracts/blogpress';
import type { PublicUser } from '@/shared/contracts/users';

/**
 * The feed card's publisher, as the public route projects it (#658).
 *
 * `PostSummary` and `Post` are TypeScript interfaces, which is enough for the
 * site and not enough for the app: a shape the app decodes is a schema, so the
 * feed's row is stated here once and generated into Kotlin
 * (`npm run contracts:generate`). The projection is the same one
 * `backend/loaders/community.ts` joins onto each post — no private column.
 */
export const PostAuthorSummarySchema = z.object({
  username: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

/** One row of the public feed: the post the site publishes, plus its publisher. */
export const PostSummarySchema = z.object({
  id: z.string(),
  author_id: z.string(),
  client_id: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
  slug: z.string(),
  content: z.string().nullable(),
  status: z.enum(['draft', 'published', 'scheduled']),
  cover_image: z.string().nullable(),
  meta_title: z.string().nullable(),
  meta_desc: z.string().nullable(),
  published_at: z.string().nullable(),
  publish_at: z.string().nullable(),
  view_count: z.number().int(),
  featured: z.boolean(),
  community_visible: z.boolean(),
  reading_time_minutes: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  author: PostAuthorSummarySchema.nullable().optional(),
});

/**
 * `GET /api/community/index`: one keyset page of the public feed.
 *
 * The cursor is opaque and belongs to the server; `null` is the last page. The
 * app pages the same way the site's island does, so the two clients ask the same
 * route the same question rather than one of them inventing a page size.
 */
export const CommunityIndexResponseSchema = z.object({
  posts: z.array(PostSummarySchema),
  // Absent and `null` are the same answer — the last page — so the app may
  // encode its own snapshot without an explicit `null` the decoder would have to
  // accept twice.
  nextCursor: z.string().nullable().optional(),
});

/** A public tag on a community post, projected the way the page draws it. */
export const PostTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

/**
 * `GET /api/community/[slug]`: one published post, as the post screen reads it.
 *
 * The page reads the same loader server-side; this route is that read as a body
 * so the app decodes the post, its public publisher and its tags rather than a
 * narrower projection. The post is the feed's row (`PostSummarySchema`) with its
 * publisher joined, so the two community surfaces cannot disagree about what a
 * post is.
 */
export const CommunityPostResponseSchema = z.object({
  post: PostSummarySchema,
  postTags: z.array(PostTagSchema),
});

export type CommunityPostResponse = z.infer<typeof CommunityPostResponseSchema>;

/**
 * The answer to the composer's create-and-publish write (#924).
 *
 * `POST /api/community/posts` takes the post's fields with `status: 'published'`
 * and answers the row it minted. The page reads the same `id` and `slug`; this
 * is that answer as a schema, so the app cannot mistake a body without them for
 * a post that landed.
 */
export const CommunityPostCreateResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
});

export type CommunityPostCreateResponse = z.infer<typeof CommunityPostCreateResponseSchema>;

/**
 * A member's public identity, as `/u/[username]` draws its header (#927).
 *
 * The single-row read carries `is_hidden` so the server can refuse a hidden
 * member (ADR-0127), but the flag stops there: a page that exists is a page
 * whose member is visible, so the contract the app decodes carries the identity
 * the header prints and nothing a viewer would have to judge.
 */
export const CommunityMemberSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  verified: z.boolean(),
});

/**
 * `GET /api/u/[username]`: a public profile and its first page of posts (#927).
 *
 * The page reads the same loader server-side; this route is that read as a body,
 * so the app draws the member's header and their published posts rather than a
 * narrower projection of the same rows. A hidden or absent handle is a `404`, the
 * page's `notFound()`, and the app draws the same sentence.
 */
export const CommunityMemberResponseSchema = z.object({
  member: CommunityMemberSchema,
  posts: z.array(PostSummarySchema),
  nextCursor: z.string().nullable().optional(),
});

export type CommunityMemberResponse = z.infer<typeof CommunityMemberResponseSchema>;

/**
 * The engagement behind one post: two numbers and the viewer's own like.
 *
 * Counts are viewer-independent and public; `liked` is the one field that needs
 * a session, and it is `false` for a guest rather than absent, so a client never
 * has to tell "not signed in" from "not liked" to draw the button.
 */
export const PostEngagementSchema = z.object({
  postId: z.string(),
  likeCount: z.number().int(),
  commentCount: z.number().int(),
  liked: z.boolean(),
});

export type PostEngagement = z.infer<typeof PostEngagementSchema>;

/**
 * `POST /api/community/engagement`: the numbers for one page of cards.
 *
 * A feed asks once per page rather than once per card — nine cards would
 * otherwise be eighteen reads. The body is `postIds` because a page of cards is
 * a set, and a GET would put that set in a URL (and in a cache key) that grows
 * with the page.
 */
export const PostEngagementBatchSchema = z.object({
  items: z.array(PostEngagementSchema),
});

export type PostEngagementBatch = z.infer<typeof PostEngagementBatchSchema>;

export const PostEngagementRequestSchema = z.object({
  postIds: z.array(z.string().uuid('معرِّف منشور غير صالح')).min(1).max(50),
});

export type PostEngagementRequest = z.infer<typeof PostEngagementRequestSchema>;

/** The longest comment the composer accepts, and the column's own check. */
export const POST_COMMENT_MAX_LENGTH = 2000;

/** One page of a thread, newest first; the cursor belongs to the server. */
export const POST_COMMENTS_PAGE_SIZE = 20;

/** The most a single thread request may ask for, so a cursor cannot be widened into a dump. */
export const POST_COMMENTS_MAX_PAGE_SIZE = 50;

/**
 * The write budget for one member.
 *
 * A like is a tap and a reader may sweep a whole feed, so its bucket is loose. A
 * comment is a written sentence and its bucket is tight — ten in five minutes is
 * one person thinking, not a script.
 */
export const POST_ENGAGEMENT_WRITE_WINDOW_MS = 5 * 60 * 1000;
export const POST_LIKE_WRITE_LIMIT = 240;
export const POST_COMMENT_WRITE_LIMIT = 10;

/** A comment's public author: the same identity a card's publisher draws. */
export const PostCommentAuthorSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

/**
 * One comment, as both clients draw it.
 *
 * `editedAt` is how the thread says «عُدّل» without a second row; the body is
 * the stored text, never a rendered fragment — the client linkifies it with the
 * same rules the post body uses.
 */
export const PostCommentSchema = z.object({
  id: z.string(),
  postId: z.string(),
  body: z.string(),
  author: PostCommentAuthorSchema.nullable(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});

export type PostComment = z.infer<typeof PostCommentSchema>;

/**
 * `GET /api/community/[slug]/comments`: one keyset page of a thread.
 *
 * `total` is the live-comment count the post's action bar prints; `nextCursor`
 * `null` is the last page. The app and the site page the thread the same way.
 */
export const PostCommentsResponseSchema = z.object({
  comments: z.array(PostCommentSchema),
  nextCursor: z.string().nullable().optional(),
  total: z.number().int(),
});

export type PostCommentsResponse = z.infer<typeof PostCommentsResponseSchema>;

/** `PUT /api/community/[slug]/like`: the state wanted, not a toggle. */
export const LikePostInputSchema = z.object({
  liked: z.boolean(),
});

export const PostLikeResponseSchema = z.object({
  liked: z.boolean(),
  likeCount: z.number().int(),
});

export type PostLikeResponse = z.infer<typeof PostLikeResponseSchema>;

const CommentBodySchema = z
  .string()
  .trim()
  .min(1, 'اكتب تعليقاً أوّلاً.')
  .max(POST_COMMENT_MAX_LENGTH, `الحدّ الأقصى ${POST_COMMENT_MAX_LENGTH} حرفًا.`);

export const CreateCommentInputSchema = z.object({ body: CommentBodySchema });

export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;

export const UpdateCommentInputSchema = CreateCommentInputSchema;

/**
 * A comment id keys a uuid column. A path segment that cannot be one would fail
 * the cast at the repository seam, before the service's own 404 could answer.
 */
export const CommentIdSchema = z.string().uuid('معرِّف تعليق غير صالح');

export const CreateCommentResponseSchema = z.object({
  comment: PostCommentSchema,
  commentCount: z.number().int(),
});

export type CreateCommentResponse = z.infer<typeof CreateCommentResponseSchema>;

export const UpdateCommentResponseSchema = z.object({
  comment: PostCommentSchema,
});

export const DeleteCommentResponseSchema = z.object({
  deleted: z.boolean(),
  commentCount: z.number().int(),
});

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

/** Upper bound on one bulk request, so a malformed client cannot fan out an unbounded batch. */
export const BULK_POSTS_MAX = 100;

export const BulkPostsActionSchema = z.object({
  action: z.enum(['publish', 'unpublish', 'delete']),
  postIds: z
    .array(z.string().uuid('معرِّف منشور غير صالح'))
    .min(1, 'اختر منشوراً واحداً على الأقل')
    .max(BULK_POSTS_MAX, `الحد الأقصى ${BULK_POSTS_MAX} منشور`)
    .transform((ids) => Array.from(new Set(ids))),
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
