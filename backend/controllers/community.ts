import * as Sentry from '@sentry/nextjs';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { recordCommunityPostView } from '@/backend/config/community';
import { loadAccountPosts } from '@/backend/loaders/community';
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
