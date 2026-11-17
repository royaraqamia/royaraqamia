import * as Sentry from '@sentry/nextjs';
import { NO_STORE, publicEdgeCache } from '@/backend/transport/cache-policy';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { identity } from '@/backend/config/identity';
import { createPostEngagementService, recordCommunityPostView } from '@/backend/config/community';
import { PostEngagementRefusedError } from '@/backend/services/blogpress/post-engagement-service';
import {
  CreateCommentInputSchema,
  LikePostInputSchema,
  POST_COMMENTS_PAGE_SIZE,
  PostCommentsResponseSchema,
  PostEngagementRequestSchema,
  PostSlugSchema,
  UpdateCommentInputSchema,
} from '@/shared/contracts/community';
import {
  loadAccountPosts,
  loadCommunityMember,
  loadCommunityPost,
} from '@/backend/loaders/community';
import { CommunityPostViewRateLimitError } from '@/backend/services/blogpress/community-view-recorder';
import { isRepositoryError } from '@/backend/shared/repository-error';
import { UsernameSchema } from '@/shared/contracts/users';

export async function recordPostView(slug: string, ip: string): Promise<HttpResult> {
  const parsed = PostSlugSchema.safeParse(slug);
  if (!parsed.success) {
    return jsonResult(400, { success: false, error: 'رابط منشور غير صالح.' });
  }

  try {
    await recordCommunityPostView(parsed.data, ip);
    return jsonResult(200, { success: true });
  } catch (error) {
    if (error instanceof CommunityPostViewRateLimitError) {
      return jsonResult(429, { success: false, error: error.message });
    }
    if (!isRepositoryError(error)) Sentry.captureException(error);
    return jsonResult(500, { success: false, error: 'تعذر تسجيل الزيارة.' });
  }
}

/**
 * One published post, on the route the app's post screen reads (#922).
 *
 * The page reads the same loader through the server component; this is that read
 * as a body, so the app decodes the post, its public publisher and its tags
 * instead of asking for a narrower projection of the same row. A slug the loader
 * has no published post for is the page's `notFound()`, answered here as `404`
 * with the same sentence the app draws.
 */
export async function getCommunityPost(slug: string): Promise<HttpResult> {
  const parsed = PostSlugSchema.safeParse(slug);
  if (!parsed.success) {
    return jsonResult(404, { error: 'المنشور غير موجود.' }, { headers: NO_STORE });
  }

  try {
    const loaded = await loadCommunityPost(parsed.data);
    if (!loaded) {
      return jsonResult(404, { error: 'المنشور غير موجود.' }, { headers: NO_STORE });
    }

    const { post, author, postTags } = loaded;
    return jsonResult(
      200,
      {
        post: {
          ...post,
          author: author
            ? {
                username: author.username,
                name: author.name,
                avatar_url: author.avatar_url,
              }
            : null,
        },
        postTags,
      },
      { headers: publicEdgeCache(300) }
    );
  } catch (error) {
    if (!isRepositoryError(error)) Sentry.captureException(error);
    return jsonResult(500, { error: 'تعذَّر تحميل المنشور.' }, { headers: NO_STORE });
  }
}

/** A handle may arrive percent-encoded (Arabic handles are), so accept both. */
function decodeHandle(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * One public member profile and their first page of posts (#927).
 *
 * The page reads the same loader in its server component; this is that read as a
 * body, so the app draws the member's header and their published posts instead of
 * a narrower projection of the same rows. A handle the loader refuses — unknown
 * or hidden (ADR-0127) — is the page's `notFound()`, answered here as `404` with
 * the same sentence the app draws.
 */
export async function getCommunityMember(username: string): Promise<HttpResult> {
  const parsed = UsernameSchema.safeParse(decodeHandle(username));
  if (!parsed.success) {
    return jsonResult(404, { error: 'الملف غير موجود.' }, { headers: NO_STORE });
  }

  try {
    const page = await loadCommunityMember(parsed.data);
    if (!page) {
      return jsonResult(404, { error: 'الملف غير موجود.' }, { headers: NO_STORE });
    }

    const { member, posts, nextCursor } = page;
    return jsonResult(
      200,
      {
        member: {
          id: member.id,
          username: member.username,
          name: member.name,
          avatar_url: member.avatar_url,
          bio: member.bio,
          verified: member.verified,
        },
        posts,
        nextCursor,
      },
      { headers: publicEdgeCache(60) }
    );
  } catch (error) {
    if (!isRepositoryError(error)) Sentry.captureException(error);
    return jsonResult(500, { error: 'تعذَّر تحميل الملف.' }, { headers: NO_STORE });
  }
}

/**
 * The signed-in member's own published community posts, read by
 * `/account/posts`' client view (#448). The page itself is a data-free shell:
 * rendering the list on the server used to put account fragments into what is
 * now a cacheable document, so the read moved behind this never-cache seam.
 */
export async function getMyAccountPosts(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const data = await loadAccountPosts(userId);
      return jsonResult(200, { success: true, data });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل منشوراتك.' } }
  );
}

/**
 * The engagement numbers for one page of cards or one post (#1573).
 *
 * `no-store`: `liked` is about the caller, so the answer cannot sit in the shared
 * document the feed is cached as. The counts themselves are public, and the
 * second read is batched over the same ids, so a page of nine cards costs two
 * reads rather than eighteen.
 */
export async function getPostEngagement(rawBody: unknown): Promise<HttpResult> {
  const parsed = PostEngagementRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResult(
      400,
      { success: false, error: parsed.error.issues[0]?.message ?? 'طلب غير صالح.' },
      { headers: NO_STORE }
    );
  }

  try {
    const { user } = await identity.resolveOptional();
    const states = await createPostEngagementService().statesFor(
      user?.id ?? null,
      parsed.data.postIds
    );

    return jsonResult(
      200,
      { items: parsed.data.postIds.map((id) => states[id]) },
      { headers: NO_STORE }
    );
  } catch (error) {
    if (!isRepositoryError(error)) Sentry.captureException(error);
    return jsonResult(500, { error: 'تعذَّر تحميل التفاعل.' }, { headers: NO_STORE });
  }
}

/** One member's like, set to the state it asked for rather than toggled. */
export async function setPostLike(slug: string, rawBody: unknown): Promise<HttpResult> {
  const parsedSlug = PostSlugSchema.safeParse(slug);
  const parsed = LikePostInputSchema.safeParse(rawBody);
  if (!parsedSlug.success || !parsed.success) {
    return jsonResult(400, { success: false, error: 'طلب غير صالح.' }, { headers: NO_STORE });
  }

  return withAuthenticatedUser(
    async ({ userId }) => {
      try {
        const result = await createPostEngagementService().setLike(
          userId,
          parsedSlug.data,
          parsed.data.liked
        );
        return jsonResult(200, { success: true, ...result }, { headers: NO_STORE });
      } catch (error) {
        return engagementFailure(error) ?? unexpectedEngagementFailure();
      }
    },
    { whenFailed: { success: false, error: 'تعذَّر تحديث الإعجاب.' } }
  );
}

/** One keyset page of a post's thread; public, so a reader need not sign in. */
export async function getPostComments(slug: string, cursor: string | null): Promise<HttpResult> {
  const parsed = PostSlugSchema.safeParse(slug);
  if (!parsed.success) {
    return jsonResult(404, { error: 'المنشور غير موجود.' }, { headers: NO_STORE });
  }

  try {
    const page = await createPostEngagementService().thread(
      parsed.data,
      cursor,
      POST_COMMENTS_PAGE_SIZE
    );
    // A shape guard on the way out: the page and the app both decode this body,
    // and a field that silently disappeared would be a blank row, not a failure.
    const body = PostCommentsResponseSchema.parse(page);
    return jsonResult(200, body, { headers: NO_STORE });
  } catch (error) {
    return engagementFailure(error) ?? unexpectedEngagementFailure('تعذَّر تحميل التعليقات.');
  }
}

export async function createPostComment(slug: string, rawBody: unknown): Promise<HttpResult> {
  const parsedSlug = PostSlugSchema.safeParse(slug);
  const parsed = CreateCommentInputSchema.safeParse(rawBody);
  if (!parsedSlug.success || !parsed.success) {
    return jsonResult(
      400,
      {
        success: false,
        error: parsed.success ? 'رابط منشور غير صالح.' : parsed.error.issues[0]?.message,
      },
      { headers: NO_STORE }
    );
  }

  return withAuthenticatedUser(
    async ({ userId }) => {
      try {
        const result = await createPostEngagementService().comment(
          userId,
          parsedSlug.data,
          parsed.data.body
        );
        return jsonResult(200, { success: true, ...result }, { headers: NO_STORE });
      } catch (error) {
        return engagementFailure(error) ?? unexpectedEngagementFailure('تعذَّر نشر التعليق.');
      }
    },
    { whenFailed: { success: false, error: 'تعذَّر نشر التعليق.' } }
  );
}

export async function editPostComment(id: string, rawBody: unknown): Promise<HttpResult> {
  const parsed = UpdateCommentInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResult(
      400,
      { success: false, error: parsed.error.issues[0]?.message ?? 'طلب غير صالح.' },
      { headers: NO_STORE }
    );
  }

  return withAuthenticatedUser(
    async ({ userId }) => {
      try {
        const result = await createPostEngagementService().editComment(
          userId,
          id,
          parsed.data.body
        );
        return jsonResult(200, { success: true, ...result }, { headers: NO_STORE });
      } catch (error) {
        return engagementFailure(error) ?? unexpectedEngagementFailure('تعذَّر تعديل التعليق.');
      }
    },
    { whenFailed: { success: false, error: 'تعذَّر تعديل التعليق.' } }
  );
}

export async function removePostComment(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      try {
        const result = await createPostEngagementService().deleteComment(userId, id);
        return jsonResult(200, { success: true, ...result }, { headers: NO_STORE });
      } catch (error) {
        return engagementFailure(error) ?? unexpectedEngagementFailure('تعذَّر حذف التعليق.');
      }
    },
    { whenFailed: { success: false, error: 'تعذَّر حذف التعليق.' } }
  );
}

/** A refusal the member can act on keeps its own sentence and status. */
function engagementFailure(error: unknown): HttpResult | null {
  if (error instanceof PostEngagementRefusedError) {
    return jsonResult(
      error.status,
      { success: false, error: error.message },
      { headers: NO_STORE }
    );
  }
  if (!isRepositoryError(error)) Sentry.captureException(error);
  return null;
}

function unexpectedEngagementFailure(message = 'تعذَّر تنفيذ الطلب.'): HttpResult {
  return jsonResult(500, { success: false, error: message }, { headers: NO_STORE });
}
