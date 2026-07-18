import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Post } from './definitions';

export const verifySession = cache(async () => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect('/auth/login?redirect=/blogpress');
  }

  return { isAuth: true, userId: data.user.id, user: data.user };
});

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data } = await supabase.auth.getUser();
  if (!data?.user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, avatar_url, bio')
    .eq('id', data.user.id)
    .single();

  return profile ?? null;
});

export async function getPostsByAuthor(authorId: string): Promise<Post[]> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', authorId)
    .order('updated_at', { ascending: false });

  return (data as Post[]) ?? [];
}

export async function getPost(id: string): Promise<Post | null> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data } = await supabase.from('posts').select('*').eq('id', id).single();

  return (data as Post) ?? null;
}

export async function getPublishedPosts(
  page = 1,
  pageSize = 10
): Promise<{ posts: Post[]; count: number }> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count } = await supabase
    .from('posts')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(from, to);

  return { posts: (data as Post[]) ?? [], count: count ?? 0 };
}

export async function getPublishedPostBySlug(slug: string): Promise<Post | null> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  return (data as Post) ?? null;
}
