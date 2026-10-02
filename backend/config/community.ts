import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';
import { getAdminSupabase } from '@/backend/config/supabase';
import {
  createCommunityViewRecorder,
  type CommunityViewRecorder,
} from '@/backend/services/blogpress/community-view-recorder';

/**
 * Default wiring for public community view counting. The increment RPC is a
 * server-side write (client EXECUTE is revoked), so it runs on the service
 * role behind the recorder's per-IP/per-slug rate limits.
 */
export function createDefaultCommunityViewRecorder(
  supabase?: SupabaseClient<Database>
): CommunityViewRecorder {
  return createCommunityViewRecorder({
    repository: createPostsRepository(supabase ?? getAdminSupabase()),
    checkRateLimit,
    captureMessage: (message, options) => Sentry.captureMessage(message, options),
  });
}

export function recordCommunityPostView(slug: string, ip: string): Promise<void> {
  return createDefaultCommunityViewRecorder().recordView(slug, ip);
}
