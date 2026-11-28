import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { PostSourceKind } from '@/shared/contracts/blogpress';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createAdminNotificationProducer } from '@/backend/config/notifications';
import { createBlogpressPostsService } from '@/backend/config/blogpress';
import { createNotesService } from '@/backend/config/notes';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';
import { createSupabaseChatRepository } from '@/backend/repositories/chat/supabase-chat-repository';
import { getAdminSupabase } from '@/backend/config/supabase';
import {
  createCommunityViewRecorder,
  type CommunityViewRecorder,
} from '@/backend/services/blogpress/community-view-recorder';
import { createPostEngagementRepository } from '@/backend/repositories/blogpress/post-engagement-repository';
import { PostEngagementService } from '@/backend/services/blogpress/post-engagement-service';
import {
  ArtifactPostService,
  type ArtifactSourceReader,
  type ArtifactText,
} from '@/backend/services/community/artifact-post-service';

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
    notify: createAdminNotificationProducer(),
    checkRateLimit: (key, limit, windowMs) =>
      checkRateLimit(key, limit, windowMs, { failClosed: true }),
  });
}

/**
 * The artifact door's composition (#1952): where each kind of supply is read.
 *
 * Both reads run on the caller's own client, so row-level security is the
 * ownership check: a note resolves only for its writer, and an assistant answer
 * only for a member of its thread. The posts service is the same one the
 * assistant's draft tool writes through.
 */
export function createArtifactPostService(supabase: SupabaseClient<Database>): ArtifactPostService {
  const reader: ArtifactSourceReader = {
    async read(userId: string, kind: PostSourceKind, id: string): Promise<ArtifactText | null> {
      if (kind === 'note') {
        const note = await createNotesService(supabase).getNote(userId, id);
        if (!note || note.deletedAt) return null;
        return { body: note.body, title: null };
      }

      const [message] = await createSupabaseChatRepository(supabase).findMessagesByIds([id]);
      if (!message || message.senderKind !== 'agent' || message.deletedAt) return null;
      return { body: message.body ?? '', title: null };
    },
  };

  return new ArtifactPostService(reader, createBlogpressPostsService(supabase));
}
