import { request } from '@/frontend/transport/http';
import { uploadImage } from '@/frontend/api/blogpress';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';
import {
  mediaPlaceholder,
  mediaPlaceholderIds,
  type BlogpressLocalStore,
} from '@/frontend/api/blogpress/local-store';

export {
  PermanentSyncError,
  classifySyncError,
  errorMessage,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

interface PostSavePayload {
  id: string;
  clientId: string;
  slug: string;
  content: string;
  cover_image: string;
  meta_title: string;
  meta_desc: string;
  updatedAt: string;
  isNew: boolean;
}

interface PostDeletePayload {
  id: string;
  updatedAt?: string;
}

/**
 * Uploads any blob a draft body still references and swaps its placeholder for
 * the returned URL, persisting the resolved body so sibling intents do not
 * upload the same bytes twice. Failure is transient: the blob stays queued.
 */
async function resolveMedia(
  store: BlogpressLocalStore,
  draftId: string,
  content: string
): Promise<string> {
  const ids = mediaPlaceholderIds(content);
  if (ids.length === 0) return content;

  let resolved = content;
  for (const id of ids) {
    const media = await store.getMedia(id);
    if (!media) continue;

    let url = media.status === 'uploaded' ? media.url : null;
    if (!url) {
      const formData = new FormData();
      formData.append('file', new File([media.blob], media.fileName, { type: media.mimeType }));
      const result = await uploadImage(formData);
      if ('error' in result && result.error) throw new Error(result.error);
      url = 'url' in result ? result.url : null;
      // The upload answered without a URL; the queue shows this reason, so it is
      // Arabic like every other failure the sync UI renders (#475).
      if (!url) throw new Error('فشل رفع الصُّورة. أعد المحاولة.');
      await store.markMediaUploaded(id, url);
    }
    resolved = resolved.split(mediaPlaceholder(id)).join(url);
  }

  if (resolved !== content) await store.applyResolvedContent(draftId, resolved);
  return resolved;
}

/**
 * Replays BlogPress Outbox intents against the existing endpoints. Drafts skip
 * the network entirely until they are queued here; an offline-created draft
 * replays as an idempotent create, a seeded draft as a last-write-wins update.
 */
export function createBlogpressHttpSyncTransport(store: BlogpressLocalStore): SyncTransport {
  return {
    async send(entry) {
      switch (entry.type) {
        case 'post.save': {
          const payload = entry.payload as PostSavePayload;
          const content = await resolveMedia(store, payload.id, payload.content);
          if (payload.isNew) {
            await request('/api/blogpress/posts', {
              method: 'POST',
              body: JSON.stringify({
                id: payload.id,
                clientId: payload.clientId,
                slug: payload.slug,
                content,
                cover_image: payload.cover_image,
                meta_title: payload.meta_title,
                meta_desc: payload.meta_desc,
                updatedAt: payload.updatedAt,
              }),
            });
            await store.confirmDraft(payload.id);
            return;
          }
          await request(`/api/blogpress/posts/${encodeURIComponent(payload.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              slug: payload.slug,
              content,
              cover_image: payload.cover_image,
              meta_title: payload.meta_title,
              meta_desc: payload.meta_desc,
              clientId: payload.clientId,
              updatedAt: payload.updatedAt,
            }),
          });
          return;
        }
        case 'post.delete': {
          const { id, updatedAt } = entry.payload as PostDeletePayload;
          await request(`/api/blogpress/posts/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            body: JSON.stringify({ updatedAt }),
          });
          return;
        }
        default:
          throw new PermanentSyncError(`Unknown outbox intent type: ${entry.type}`);
      }
    },
  };
}
