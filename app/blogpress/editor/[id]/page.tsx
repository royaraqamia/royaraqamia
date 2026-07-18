import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySession } from '@/domains/blogpress/lib/dal';
import { EditorContent } from './editor-content';
import type { Post } from '@/domains/blogpress/lib/definitions';

export default async function EditorPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .eq('author_id', session.userId)
    .single();

  if (!post) notFound();

  return <EditorContent post={post as Post} />;
}
