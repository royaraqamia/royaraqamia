import { request } from '@/frontend/transport/http';

export interface PostFields {
  title: string;
  slug: string;
  content: string;
  cover_image: string;
  meta_title: string;
  meta_desc: string;
}

export async function createPost(): Promise<{ id: string }> {
  return request<{ id: string }>('/api/blogpress/posts', { method: 'POST' });
}

export async function updatePost(
  postId: string,
  fields: PostFields
): Promise<{ message?: string; errors?: Record<string, string[]> }> {
  try {
    return await request<{ message?: string; errors?: Record<string, string[]> }>(
      `/api/blogpress/posts/${encodeURIComponent(postId)}`,
      { method: 'PATCH', body: JSON.stringify(fields) }
    );
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'فشل حفظ المقال' };
  }
}

export async function saveAndPublishPost(
  postId: string,
  fields: PostFields
): Promise<{ success?: boolean; errors?: Record<string, string[]> }> {
  return request<{ success?: boolean; errors?: Record<string, string[]> }>(
    `/api/blogpress/posts/${encodeURIComponent(postId)}/save-and-publish`,
    { method: 'POST', body: JSON.stringify(fields) }
  );
}

export async function publishPost(postId: string): Promise<void> {
  await request(`/api/blogpress/posts/${encodeURIComponent(postId)}/publish`, { method: 'POST' });
}

export async function unpublishPost(postId: string): Promise<void> {
  await request(`/api/blogpress/posts/${encodeURIComponent(postId)}/unpublish`, {
    method: 'POST',
  });
}

export async function deletePost(postId: string): Promise<void> {
  await request(`/api/blogpress/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
}

export async function uploadImage(
  formData: FormData
): Promise<{ url: string } | { error: string }> {
  try {
    return await request<{ url: string } | { error: string }>('/api/blogpress/media', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل رفع الصُّورة' };
  }
}
