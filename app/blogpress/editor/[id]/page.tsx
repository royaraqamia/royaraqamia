import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { verifySession } from '@/backend/middleware/session-guard';
import { EditorContent } from './editor-content';
import { createBlogpressPostsService } from '@/backend/config/blogpress';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);

  const title = await createBlogpressPostsService(supabase).getPostTitleById(id);

  return {
    title: title ? `تحرير: ${title}` : 'تحرير المقال',
    description: 'تحرير وتعديل المقالات في BlogPress.',
  };
}

export default async function EditorPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);

  const post = await createBlogpressPostsService(supabase).getPostForUser(id, session.userId);

  if (!post) notFound();

  return <EditorContent post={post} />;
}
