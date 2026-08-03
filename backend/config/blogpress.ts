import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';
import { createMediaRepository } from '@/backend/repositories/blogpress/supabase-media';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { BlogpressPostsService } from '@/backend/services/blogpress/posts-service';
import { BlogpressMediaService } from '@/backend/services/blogpress/media-service';
import { env } from '@/backend/config/env';

export function createBlogpressPostsService(
  supabase: SupabaseClient<Database>
): BlogpressPostsService {
  return new BlogpressPostsService(createPostsRepository(supabase), env.adminEmails);
}

export function createBlogpressAdminPostsService(): BlogpressPostsService {
  return new BlogpressPostsService(createPostsRepository(getAdminSupabase()), env.adminEmails);
}

export function createBlogpressMediaService(
  supabase: SupabaseClient<Database>
): BlogpressMediaService {
  return new BlogpressMediaService(createMediaRepository(supabase));
}
