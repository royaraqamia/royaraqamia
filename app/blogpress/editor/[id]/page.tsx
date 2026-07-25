import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySession } from '@/domains/blogpress/lib/dal';
import { EditorContent } from './editor-content';
import type { Post } from '@/domains/blogpress/lib/definitions';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data: post } = await supabase.from('posts').select('title').eq('id', id).single();

  return {
    title: post ? `تحرير: ${post.title}` : 'تحرير المقال',
    description: 'تحرير وتعديل المقالات في BlogPress.',
  };
}

export default async function EditorPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .eq('author_id', session.userId)
    .single();

  if (postError && postError.code !== 'PGRST116') {
    throw new Error(`Failed to fetch post: ${postError.message}`);
  }

  if (!post) notFound();

  return <EditorContent post={post as Post} />;
}
