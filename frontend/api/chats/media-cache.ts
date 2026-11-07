import type { ChatAttachment, ChatMessage } from '@/shared/contracts/chat';
import { currentConnection, isMeteredConnection } from '@/frontend/shared/local-store/audio';
import type { ChatsLocalStore } from './local-store';

/**
 * The read half of a chat attachment (#1033): the bytes a member has opened
 * stay on the device, and a Wi-Fi connection fills the cache ahead of them.
 *
 * The cache is the same media store the outbox writes to. A queued line's bytes
 * are a separate key (`out:<clientId>:<n>`); a received file is
 * `att:<attachmentId>`, so the two can never collide and a landed row never
 * inherits a copy that was still waiting for the bucket.
 */
export function attachmentMediaKey(attachmentId: string): string {
  return `att:${attachmentId}`;
}

/** How many files one open may fetch in the background. */
export const CHAT_PREFETCH_LIMIT = 10;

export interface ChatMediaDeps {
  fetcher?: typeof fetch;
  /** Whether this connection is one to spend bytes on unasked. */
  isMetered?: () => boolean;
  now?: () => number;
}

/**
 * Downloads one attachment into the cache from a URL the caller already holds.
 *
 * The URL is minted before the bytes are asked for, so a failed download costs
 * one request and leaves the cache as it was. Returns the blob, or null when
 * the bytes could not be kept — a chip still opens from the URL in that case.
 */
export async function cacheChatAttachment(
  store: ChatsLocalStore,
  conversationId: string,
  attachment: ChatAttachment,
  url: string,
  deps: ChatMediaDeps = {}
): Promise<Blob | null> {
  try {
    const response = await (deps.fetcher ?? fetch)(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    const at = (deps.now ?? Date.now)();
    await store.saveMedia({
      key: attachmentMediaKey(attachment.id),
      clientId: null,
      conversationId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      bytes: blob.size,
      blob,
      kind: 'attachment',
      storedAt: at,
      lastUsedAt: at,
    });
    return blob;
  } catch {
    // The bytes are an optimisation: the chip's own URL still opens the file.
    return null;
  }
}

/**
 * Fills the cache for the files of a thread that was just read (#1033).
 *
 * Unasked traffic is the thing this refuses: a metered connection, `saveData`,
 * or a browser that says it is offline prefetches nothing. Newest lines first,
 * because they are the files a member is most likely to open next, and
 * {@link CHAT_PREFETCH_LIMIT} bounds what one open may spend.
 */
export async function prefetchChatAttachments(
  store: ChatsLocalStore,
  conversationId: string,
  messages: readonly ChatMessage[],
  loadUrl: (attachmentId: string) => Promise<string | null>,
  deps: ChatMediaDeps = {}
): Promise<number> {
  const metered = deps.isMetered ?? (() => isMeteredConnection(currentConnection()));
  if (metered()) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

  const newestFirst = [...messages]
    .reverse()
    .flatMap((message) => message.attachments.map((attachment) => attachment));

  let fetched = 0;
  for (const attachment of newestFirst) {
    if (fetched >= CHAT_PREFETCH_LIMIT) break;
    if (await store.getMedia(attachmentMediaKey(attachment.id))) continue;

    const url = await loadUrl(attachment.id);
    if (!url) continue;
    if (await cacheChatAttachment(store, conversationId, attachment, url, deps)) fetched += 1;
  }
  return fetched;
}
