import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { verifySession } from '@/backend/middleware/session-guard';
import { getBlogpressPosts } from '@/backend/loaders/blogpress';
import { EditorContent } from './editor-content';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const { repository } = await getBlogpressPosts();
  const title = await repository.getPostTitleById(id);

  return {
    title: title ? `تحرير: ${title}` : 'تحرير المقال',
    description: 'تحرير وتعديل المقالات في BlogPress.',
  };
}

export default async function EditorPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await verifySession();
  const { repository } = await getBlogpressPosts();

  const post = await repository.getPostForUser(id, session.userId);

  if (!post) notFound();

  const [availableTags, postTags] = await Promise.all([
    repository.listTagsByAuthor(session.userId),
    repository.getPostTags(post.id),
  ]);

  return <EditorContent post={post} availableTags={availableTags} initialPostTags={postTags} />;
}
