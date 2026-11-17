import { request } from '@/frontend/transport/http';
import type {
  PostCommentsResponse,
  PostEngagement,
  PostLikeResponse,
} from '@/shared/contracts/community';

/**
 * The engagement the page draws, as bodies.
 *
 * The counts are public and the `liked` flag is the caller's own, so both reads
 * are `no-store`: they must never be folded into the cached document the feed
 * is served as.
 */
export async function fetchPostEngagement(postIds: string[]): Promise<PostEngagement[]> {
  const { items } = await request<{ items: PostEngagement[] }>('/api/community/engagement', {
    method: 'POST',
    body: JSON.stringify({ postIds }),
  });
  return items;
}

/** Sets the state wanted; the answer carries the count the button settles on. */
export async function setPostLike(slug: string, liked: boolean): Promise<PostLikeResponse> {
  return request<PostLikeResponse>(`/api/community/${encodeURIComponent(slug)}/like`, {
    method: 'PUT',
    body: JSON.stringify({ liked }),
  });
}

export async function fetchPostComments(
  slug: string,
  cursor?: string | null
): Promise<PostCommentsResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request<PostCommentsResponse>(
    `/api/community/${encodeURIComponent(slug)}/comments${query}`
  );
}

export async function createPostComment(
  slug: string,
  body: string
): Promise<{ comment: PostCommentsResponse['comments'][number]; commentCount: number }> {
  return request(`/api/community/${encodeURIComponent(slug)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function updatePostComment(
  commentId: string,
  body: string
): Promise<{ comment: PostCommentsResponse['comments'][number] }> {
  return request(`/api/community/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export async function deletePostComment(
  commentId: string
): Promise<{ deleted: boolean; commentCount: number }> {
  return request(`/api/community/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  });
}
