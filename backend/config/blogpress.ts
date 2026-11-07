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
    posts: new BlogpressPostsService(repository),
  };
}

export function createBlogpressAdminPostsModule(): BlogpressPostsModule {
  return createBlogpressPostsModule(getAdminSupabase());
}

export function createBlogpressMediaService(
  supabase: SupabaseClient<Database>
): BlogpressMediaService {
  return new BlogpressMediaService(createMediaRepository(supabase));
}
