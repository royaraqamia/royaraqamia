import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';
import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';

// The container is the one place that names the implementation, so a caller that
// needs the repository itself (the assistant's tools, the MCP data plane) asks
// here rather than importing `backend/repositories` across a service boundary
// (`layers/no-cross-layer-import`).
export { createPostsRepository };
import { createMediaRepository } from '@/backend/repositories/blogpress/supabase-media';
import { getAdminSupabase } from '@/backend/config/supabase';
import {
  BlogpressPostsService,
  type PostPublishedNotifier,
} from '@/backend/services/blogpress/posts-service';
import { BlogpressMediaService } from '@/backend/services/blogpress/media-service';
import { createNotificationFanout, type NotificationFanout } from '@/backend/config/notifications';

/**
 * The Blogpress post module and the repository it rules over, wired to one
 * client. Rule-carrying operations go through `posts`; pure reads and
 * single-writes go through `repository`.
 */
export interface BlogpressPostsModule {
  repository: PostsRepository;
  posts: BlogpressPostsService;
}

export function createBlogpressPostsModule(
  supabase: SupabaseClient<Database>
): BlogpressPostsModule {
  const repository = createPostsRepository(supabase);
  return {
    repository,
    posts: new BlogpressPostsService(repository, createPostPublishedNotifier()),
  };
}

export function createBlogpressAdminPostsModule(): BlogpressPostsModule {
  return createBlogpressPostsModule(getAdminSupabase());
}

/**
 * Fire-and-forget: notifies the Admin audience (except the publishing author)
 * that a new post went live. No subscriber model exists, so admins are the
 * defined audience for blogpress; the author is subtracted as an exclusion.
 */
export function createPostPublishedNotifier(
  fanOut: NotificationFanout = createNotificationFanout()
): PostPublishedNotifier {
  return ({ postId, authorId, slug }) => {
    void fanOut(
      {
        type: 'post_published',
        title: 'تم نشر منشور جديد',
        body: 'تم نشر منشور جديد على المجتمع.',
        metadata: { postId, slug },
      },
      { excludeUserIds: [authorId] }
    );
  };
}

export function createBlogpressMediaService(
  supabase: SupabaseClient<Database>
): BlogpressMediaService {
  return new BlogpressMediaService(createMediaRepository(supabase));
}
