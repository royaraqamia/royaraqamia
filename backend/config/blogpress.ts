import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';
import { createMediaRepository } from '@/backend/repositories/blogpress/supabase-media';
import { getAdminSupabase } from '@/backend/config/supabase';
import {
  BlogpressPostsService,
  type PostPublishedNotifier,
} from '@/backend/services/blogpress/posts-service';
import { BlogpressMediaService } from '@/backend/services/blogpress/media-service';
import { createAdminNotificationProducer } from '@/backend/config/notifications';
import { logger } from '@/backend/shared/logger';
import { env } from '@/backend/config/env';

export function createBlogpressPostsService(
  supabase: SupabaseClient<Database>
): BlogpressPostsService {
  return new BlogpressPostsService(
    createPostsRepository(supabase),
    env.adminEmails,
    createPostPublishedNotifier()
  );
}

export function createBlogpressAdminPostsService(): BlogpressPostsService {
  return new BlogpressPostsService(
    createPostsRepository(getAdminSupabase()),
    env.adminEmails,
    createPostPublishedNotifier()
  );
}

/**
 * Fire-and-forget: notifies every admin user (except the publishing author)
 * that a new post went live. No subscriber model exists, so admins are the
 * defined audience for blogpress.
 */
export function createPostPublishedNotifier(): PostPublishedNotifier {
  const notify = createAdminNotificationProducer();
  return ({ postId, authorId, slug }) => {
    void (async () => {
      try {
        const { data } = await getAdminSupabase().from('users').select('id').eq('is_admin', true);
        const adminIds = (data ?? []).map((row) => row.id).filter((id) => id !== authorId);
        await Promise.all(
          adminIds.map((userId) =>
            notify({
              user_id: userId,
              type: 'post_published',
              title: 'تم نشر مقال جديد',
              body: 'تم نشر مقال جديد على المدونة.',
              metadata: { postId, slug },
            })
          )
        );
      } catch (err) {
        logger.error('Failed to notify admins about published post', { error: String(err) });
      }
    })();
  };
}

export function createBlogpressMediaService(
  supabase: SupabaseClient<Database>
): BlogpressMediaService {
  return new BlogpressMediaService(createMediaRepository(supabase));
}
