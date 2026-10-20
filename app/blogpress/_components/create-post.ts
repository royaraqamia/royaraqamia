import { createPost } from '@/frontend/api/blogpress';
import { logger } from '@/frontend/shared/logger';
import { toast } from 'sonner';

export const CREATE_POST_FAILED_MESSAGE =
  'تعذّر إنشاء منشور جديد. تحقّق من اتصالك ثم أعد المحاولة.';

/**
 * Creates a post and returns its id. On failure the error is logged and an
 * Arabic toast is shown, returning `null` so the caller does not navigate.
 * Both new-post controls share this so they stay in step.
 */
export async function createPostOrReportFailure(): Promise<string | null> {
  try {
    const { id } = await createPost();
    return id;
  } catch (error) {
    logger.error('blogpress.createPost failed', {
      operation: 'createPost',
      error: error instanceof Error ? error.message : String(error),
    });
    toast.error(CREATE_POST_FAILED_MESSAGE);
    return null;
  }
}
