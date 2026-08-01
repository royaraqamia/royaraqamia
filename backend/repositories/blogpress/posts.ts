import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/contracts/database.types';
import type { Post } from '@/backend/models/blogpress';

export interface PublishedPostsResult {
  posts: Post[];
  totalPages: number;
}

export async function getPublishedPosts(
  supabase: SupabaseClient<Database>,
  page: number,
  query: string,
  pageSize: number
): Promise<PublishedPostsResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let queryBuilder = supabase
    .from('posts')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .eq('blog_visible', true);

  if (query) {
    queryBuilder = queryBuilder.or(`title.ilike.%${query}%,meta_desc.ilike.%${query}%`);
  }

  const { data: posts, count } = await queryBuilder
    .order('published_at', { ascending: false })
    .range(from, to);

  return {
    posts: (posts as Post[]) ?? [],
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}

export async function getPublishedPostBySlug(
  supabase: SupabaseClient<Database>,
  slug: string
): Promise<Post | null> {
  const { data } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  return (data as Post) ?? null;
}

export async function getPostAuthor(
  supabase: SupabaseClient<Database>,
  authorId: string
): Promise<{ name: string | null; avatar_url: string | null; bio: string | null } | null> {
  const { data } = await supabase
    .from('users')
    .select('name, avatar_url, bio')
    .eq('id', authorId)
    .maybeSingle();
  return data ?? null;
}

export async function getRelatedPosts(
  supabase: SupabaseClient<Database>,
  slug: string
): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('id, title, slug, cover_image, published_at, content')
    .eq('status', 'published')
    .eq('blog_visible', true)
    .neq('slug', slug)
    .order('published_at', { ascending: false })
    .limit(3);
  return (data as Post[]) ?? [];
}

export async function listPostsByAuthor(
  supabase: SupabaseClient<Database>,
  authorId: string
): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', authorId)
    .order('updated_at', { ascending: false });
  return (data as Post[]) ?? [];
}

export async function getPostTitleById(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<string | null> {
  const { data } = await supabase.from('posts').select('title').eq('id', id).single();
  return data?.title ?? null;
}

export async function getPostForUser(
  supabase: SupabaseClient<Database>,
  id: string,
  userId: string
): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .eq('author_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch post: ${error.message}`);
  }

  return (data as Post) ?? null;
}
