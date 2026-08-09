import { request } from '@/frontend/transport/http';
import type { PostTag } from '@/shared/contracts/blogpress';

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

export async function setPostFeatured(postId: string, featured: boolean): Promise<void> {
  await request(`/api/blogpress/posts/${encodeURIComponent(postId)}/featured`, {
    method: 'POST',
    body: JSON.stringify({ featured }),
  });
}

export type BulkPostAction = 'publish' | 'unpublish' | 'delete' | 'setCategory';

export async function bulkPostAction(
  action: BulkPostAction,
  postIds: string[],
  categoryId?: string | null
): Promise<{ success: boolean; affected: number }> {
  return request<{ success: boolean; affected: number }>('/api/blogpress/posts/bulk', {
    method: 'POST',
    body: JSON.stringify({ action, postIds, categoryId }),
  });
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

export async function listTags(): Promise<PostTag[]> {
  return request<{ tags: PostTag[] }>('/api/blogpress/tags', { method: 'GET' }).then(
    (res) => res.tags
  );
}

export async function createTag(input: {
  name: string;
  slug: string;
}): Promise<{ tag: PostTag } | { errors?: Record<string, string[]> }> {
  return request<{ tag: PostTag } | { errors?: Record<string, string[]> }>('/api/blogpress/tags', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteTag(tagId: string): Promise<void> {
  await request(`/api/blogpress/tags/${encodeURIComponent(tagId)}`, { method: 'DELETE' });
}

export async function setPostTags(
  postId: string,
  tagIds: string[]
): Promise<{ success?: boolean } | { errors?: Record<string, string[]> }> {
  return request<{ success?: boolean } | { errors?: Record<string, string[]> }>(
    `/api/blogpress/posts/${encodeURIComponent(postId)}/tags`,
    { method: 'PUT', body: JSON.stringify({ tagIds }) }
  );
}
