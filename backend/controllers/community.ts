import * as Sentry from '@sentry/nextjs';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { recordCommunityPostView } from '@/backend/config/community';
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
