import * as Sentry from '@sentry/nextjs';
import { NO_STORE, PUBLIC_CACHEABLE } from '@/backend/transport/cache-policy';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { recordCommunityPostView } from '@/backend/config/community';
import { loadAccountPosts, loadCommunityPost } from '@/backend/loaders/community';
import { CommunityPostViewRateLimitError } from '@/backend/services/blogpress/community-view-recorder';
import { isRepositoryError } from '@/backend/shared/repository-error';
import { PostSlugSchema } from '@/shared/contracts/community';

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
      { headers: PUBLIC_CACHEABLE }
    );
  } catch (error) {
    if (!isRepositoryError(error)) Sentry.captureException(error);
    return jsonResult(500, { error: 'تعذَّر تحميل المنشور.' }, { headers: NO_STORE });
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
