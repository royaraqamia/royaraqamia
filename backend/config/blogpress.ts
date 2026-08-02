import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';
import { createMediaRepository } from '@/backend/repositories/blogpress/supabase-media';
import { BlogpressPostsService } from '@/backend/services/blogpress/posts-service';
import { BlogpressMediaService } from '@/backend/services/blogpress/media-service';

export function createBlogpressPostsService(
  supabase: SupabaseClient<Database>
): BlogpressPostsService {
  return new BlogpressPostsService(createPostsRepository(supabase));
}

export function createBlogpressMediaService(
  supabase: SupabaseClient<Database>
): BlogpressMediaService {
  return new BlogpressMediaService(createMediaRepository(supabase));
}
