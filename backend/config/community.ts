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
import { createPostEngagementRepository } from '@/backend/repositories/blogpress/post-engagement-repository';
import { PostEngagementService } from '@/backend/services/blogpress/post-engagement-service';

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

/**
 * The likes/comments module, wired to one client.
 *
 * The write functions are service-role only (they act as the member id they are
 * handed), so the read and the write share the admin client, and the per-member
 * budget is enforced here rather than in Postgres: it decides whether a write
 * may happen at all, and Upstash is not reachable from the database.
 */
export function createPostEngagementService(
  supabase?: SupabaseClient<Database>
): PostEngagementService {
  return new PostEngagementService({
    engagement: createPostEngagementRepository(supabase ?? getAdminSupabase()),
    checkRateLimit: (key, limit, windowMs) =>
      checkRateLimit(key, limit, windowMs, { failClosed: true }),
  });
}
