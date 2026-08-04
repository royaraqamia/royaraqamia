import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { verifySession } from '@/backend/middleware/session-guard';
import { loadEditorPost, loadEditorPostTitle } from '@/backend/loaders/blogpress';
import { EditorContent } from './editor-content';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const title = await loadEditorPostTitle(id);

  return {
    title: title ? `تحرير: ${title}` : 'تحرير المقال',
    description: 'تحرير وتعديل المقالات في BlogPress.',
  };
}

export default async function EditorPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await verifySession();

  const post = await loadEditorPost(id, session.userId);

  if (!post) notFound();

  return <EditorContent post={post} />;
}
