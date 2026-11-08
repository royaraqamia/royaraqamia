import { request } from '@/frontend/transport/http';
import type { BlogpressSyncSnapshot, RestorePostSnapshot } from '@/shared/contracts/blogpress';
import type { PostStatusInput } from '@/shared/contracts/community';

export interface PostFields {
  slug: string;
  content: string;
  cover_image: string;
  meta_title: string;
  meta_desc: string;
  /** Offline write contract (ADR-0029): client-minted id and logical write time. */
  clientId?: string;
  updatedAt?: string;
}

export async function restorePost(snapshot: RestorePostSnapshot): Promise<{ id: string }> {
  return request<{ success: boolean; id: string }>('/api/community/posts/restore', {
    method: 'POST',
    body: JSON.stringify(snapshot),
  });
}

/**
 * Owned snapshot (incl. tombstones) for the client pull (ADR-0060). The merge
 * is the store's own LWW, so a re-read of the whole set is idempotent.
 */
export async function getSyncSnapshot(): Promise<BlogpressSyncSnapshot> {
  return request<BlogpressSyncSnapshot>('/api/community/sync');
}

export async function createPost(
  payload?: PostFields & {
    id?: string;
    /** A new post published in the same request (#527); drafts omit it. */
    status?: PostStatusInput;
  }
): Promise<{ id: string; slug?: string }> {
  return request<{ id: string; slug?: string }>('/api/community/posts', {
    method: 'POST',
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

export async function updatePost(
  postId: string,
  fields: PostFields
): Promise<{ message?: string; errors?: Record<string, string[]> }> {
  try {
    return await request<{ message?: string; errors?: Record<string, string[]> }>(
      `/api/community/posts/${encodeURIComponent(postId)}`,
      { method: 'PATCH', body: JSON.stringify(fields) }
    );
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'فشل حفظ المنشور' };
  }
}

export async function saveAndPublishPost(
  postId: string,
  fields: PostFields
): Promise<{ success?: boolean; errors?: Record<string, string[]> }> {
  return request<{ success?: boolean; errors?: Record<string, string[]> }>(
    `/api/community/posts/${encodeURIComponent(postId)}/save-and-publish`,
    { method: 'POST', body: JSON.stringify(fields) }
  );
}

export async function publishPost(postId: string): Promise<void> {
  await request(`/api/community/posts/${encodeURIComponent(postId)}/publish`, { method: 'POST' });
}

export async function unpublishPost(postId: string): Promise<void> {
  await request(`/api/community/posts/${encodeURIComponent(postId)}/unpublish`, {
    method: 'POST',
  });
}

export async function schedulePost(postId: string, publishAt: string): Promise<void> {
  await request(`/api/community/posts/${encodeURIComponent(postId)}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify({ publish_at: publishAt }),
  });
}

export async function deletePost(postId: string): Promise<void> {
  await request(`/api/community/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
}

export async function duplicatePost(postId: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/api/community/posts/${encodeURIComponent(postId)}/duplicate`, {
    method: 'POST',
  });
}

export async function setPostFeatured(postId: string, featured: boolean): Promise<void> {
  await request(`/api/community/posts/${encodeURIComponent(postId)}/featured`, {
    method: 'POST',
    body: JSON.stringify({ featured }),
  });
}

export type BulkPostAction = 'publish' | 'unpublish' | 'delete';

export async function bulkPostAction(
  action: BulkPostAction,
  postIds: string[]
): Promise<{ success: boolean; affected: number }> {
  return request<{ success: boolean; affected: number }>('/api/community/posts/bulk', {
    method: 'POST',
    body: JSON.stringify({ action, postIds }),
  });
}

export async function uploadImage(
  formData: FormData
): Promise<{ url: string } | { error: string }> {
  try {
    return await request<{ url: string } | { error: string }>('/api/community/media', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل رفع الصُّورة' };
  }
}
