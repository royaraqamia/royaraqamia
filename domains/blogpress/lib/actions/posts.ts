'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySession } from '@/domains/blogpress/lib/dal';
import { PostSchema } from '@/lib/schemas';

export async function createPost() {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: session.userId,
      title: '',
      slug: `بدون-عنوان-${crypto.randomUUID().slice(0, 8)}`,
    })
    .select('id')
    .single();

  if (error) throw new Error('فشل إنشاء المقال');

  revalidatePath('/blogpress/dashboard');
  redirect(`/blogpress/dashboard/editor/${data.id}`);
}

export async function updatePost(postId: string, _prevState: unknown, formData: FormData) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const validated = PostSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug'),
    content: formData.get('content'),
    cover_image: formData.get('cover_image'),
    meta_title: formData.get('meta_title'),
    meta_desc: formData.get('meta_desc'),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from('posts')
    .update(validated.data)
    .eq('id', postId)
    .eq('author_id', session.userId);

  if (error) {
    return { message: error.message };
  }

  revalidatePath('/blogpress/dashboard');
  revalidatePath(`/blogpress/dashboard/editor/${postId}`);
  return { message: 'تم حفظ المقال' };
}

export async function savePostContent(postId: string, content: string) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { error } = await supabase
    .from('posts')
    .update({ content })
    .eq('id', postId)
    .eq('author_id', session.userId);

  if (error) throw new Error('فشل حفظ المحتوى');
}

export async function publishPost(postId: string) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { error } = await supabase
    .from('posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .eq('author_id', session.userId);

  if (error) throw new Error('فشل نشر المقال');

  revalidatePath('/blogpress/dashboard');
  revalidatePath('/blogpress/blog');
  revalidatePath('/sitemap.xml');
}

export async function unpublishPost(postId: string) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { error } = await supabase
    .from('posts')
    .update({
      status: 'draft',
      published_at: null,
    })
    .eq('id', postId)
    .eq('author_id', session.userId);

  if (error) throw new Error('فشل إلغاء نشر المقال');

  revalidatePath('/blogpress/dashboard');
  revalidatePath('/blogpress/blog');
  revalidatePath('/sitemap.xml');
}

export async function deletePost(postId: string) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('author_id', session.userId);

  if (error) throw new Error('فشل حذف المقال');

  revalidatePath('/blogpress/dashboard');
  revalidatePath('/blogpress/blog');
}
