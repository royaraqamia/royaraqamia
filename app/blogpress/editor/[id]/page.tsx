import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/backend/transport/supabase/server';
import { verifySession } from '@/backend/actions/blogpress/dal';
import { EditorContent } from './editor-content';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const title = await createPostsRepository(supabase).getPostTitleById(id);

  return {
    title: title ? `تحرير: ${title}` : 'تحرير المقال',
    description: 'تحرير وتعديل المقالات في BlogPress.',
  };
}

export default async function EditorPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const post = await createPostsRepository(supabase).getPostForUser(id, session.userId);

  if (!post) notFound();

  return <EditorContent post={post} />;
}
