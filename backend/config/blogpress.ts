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
import { createFollowsRepository } from '@/backend/repositories/users/follows-repository';
import { createAdminUsersRepository } from '@/backend/repositories/users/admin-users-repository';
import {
  createAdminNotificationProducer,
  createPostPublishedNotifier,
  type PostPublishedNotifier,
} from '@/backend/config/notifications';
import { BlogpressPostsService } from '@/backend/services/blogpress/posts-service';
import { BlogpressMediaService } from '@/backend/services/blogpress/media-service';

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
    posts: new BlogpressPostsService(repository, getPostPublishedNotifier()),
  };
}

/**
 * The post rules alone, for a caller that only writes drafts through them
 * (#1952): the assistant's draft tool and the artifact door share this one
 * service. No publish notifier is wired, because neither door publishes.
 */
export function createBlogpressPostsService(
  supabase: SupabaseClient<Database>
): BlogpressPostsService {
  return new BlogpressPostsService(createPostsRepository(supabase));
}

/**
 * The follow graph and the users table are service-role reads: a publish must
 * see every follower edge, and the harness emails are the only way to tell a
 * seeded post from a member's. The producer is built once per process, the same
 * way `backend/config/follows.ts` builds its `new_follower` producer.
 */
let postPublishedNotifier: PostPublishedNotifier | null = null;

function getPostPublishedNotifier(): PostPublishedNotifier {
  if (postPublishedNotifier) return postPublishedNotifier;

  const admin = getAdminSupabase();
  postPublishedNotifier = createPostPublishedNotifier({
    notify: createAdminNotificationProducer(),
    followersOf: (authorId) => createFollowsRepository(admin).allFollowerIds(authorId),
    recipientEmailsOf: (ids) => createAdminUsersRepository(admin).findRecipientEmails(ids),
  });
  return postPublishedNotifier;
}

export function createBlogpressAdminPostsModule(): BlogpressPostsModule {
  return createBlogpressPostsModule(getAdminSupabase());
}

export function createBlogpressMediaService(
  supabase: SupabaseClient<Database>
): BlogpressMediaService {
  return new BlogpressMediaService(createMediaRepository(supabase));
}
