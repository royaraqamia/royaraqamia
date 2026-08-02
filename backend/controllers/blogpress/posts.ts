'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/backend/transport/supabase/server';
import { verifySession } from '@/backend/middleware/session-guard';
import { createBlogpressPostsService } from '@/backend/config/blogpress';
import { PostSchema } from '@/shared/contracts/blog';
import { AdminValidator } from '@/backend/shared/admin-validator';

export async function createPost() {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const service = createBlogpressPostsService(supabase);

  const { id } = await service.createPost(session.userId);

  revalidatePath('/blogpress');
  redirect(`/blogpress/editor/${id}`);
}

export async function updatePost(postId: string, _prevState: unknown, formData: FormData) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const service = createBlogpressPostsService(supabase);

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

  try {
    await service.updatePost(postId, session.userId, validated.data);
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'فشل حفظ المقال' };
  }

  revalidatePath('/blogpress');
  revalidatePath(`/blogpress/editor/${postId}`);
  revalidatePath(`/blog/${validated.data.slug}`);
  revalidatePath('/blog');
  return { message: 'تمَّ حفظ المقال' };
}

export async function saveAndPublishPost(postId: string, formData: FormData) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const service = createBlogpressPostsService(supabase);

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

  const blogVisible = AdminValidator.isAdmin(session.user.email ?? '');

  const { slug } = await service.saveAndPublishPost(
    postId,
    session.userId,
    validated.data,
    blogVisible
  );

  revalidatePath('/blogpress');
  revalidatePath(`/blog/${slug}`);
  revalidatePath('/blog');
  revalidatePath('/sitemap.xml');
  return {};
}

export async function publishPost(postId: string) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const service = createBlogpressPostsService(supabase);

  const blogVisible = AdminValidator.isAdmin(session.user.email ?? '');

  const { slug } = await service.publishPost(postId, session.userId, blogVisible);

  revalidatePath('/blogpress');
  revalidatePath(`/blog/${slug}`);
  revalidatePath('/blog');
  revalidatePath('/sitemap.xml');
}

export async function unpublishPost(postId: string) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const service = createBlogpressPostsService(supabase);

  const { slug } = await service.unpublishPost(postId, session.userId);

  revalidatePath('/blogpress');
  revalidatePath(`/blog/${slug}`);
  revalidatePath('/blog');
  revalidatePath('/sitemap.xml');
}

export async function deletePost(postId: string) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const service = createBlogpressPostsService(supabase);

  const { slug } = await service.deletePost(postId, session.userId);

  revalidatePath('/blogpress');
  revalidatePath(`/blog/${slug}`);
  revalidatePath('/blog');
}
