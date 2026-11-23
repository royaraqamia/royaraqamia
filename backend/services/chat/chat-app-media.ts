import { randomUUID } from 'node:crypto';

import type { ChatAttachmentStorage } from '@/backend/repositories/chat/chat-attachment-storage';
import type { McpAppToolsService } from '@/backend/services/mcp/marketplace/app-tools-service';
import { logger } from '@/backend/shared/logger';
import {
  CHAT_MEDIA_MAX_BYTES,
  CHAT_MEDIA_ROUTE,
  chatMediaKindForMime,
  type ChatMedia,
} from '@/shared/contracts/chat-media';

/**
 * The file a member-paid connector produced, as one seam for both ways a tool
 * can run: directly in a turn, and after the member confirms a card (ADR-0216).
 *
 * The answer is data, never instruction. Only a bounded https file URL is
 * followed, only through `mcp-remote`'s guarded fetch with the member's own
 * encrypted token, and the bytes are stored in our bucket. What leaves here is
 * a same-origin route that mints a one-minute signed URL on every read.
 */

export type GeneratedMediaOutcome =
  { status: 'none' } | { status: 'ok'; media: ChatMedia } | { status: 'failed' };

/** A tool's link to the file it generated, and the MIME it declared beside it. */
interface GeneratedMediaLink {
  url: string;
  mimeType?: string;
}

/** Only a renderable file name behind https is a media answer. */
const MEDIA_FILE_URL = /^https:\/\/[^\s<>"']+\.(png|jpe?g|webp|gif|mp4|webm)(?:[?#][^\s<>"']*)?$/i;

function mimeFromUrl(url: string): string | null {
  const match = MEDIA_FILE_URL.exec(url);
  const extension = match?.[1]?.toLowerCase();
  if (!extension) return null;
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'mp4') return 'video/mp4';
  if (extension === 'webm') return 'video/webm';
  return `image/${extension}`;
}

/**
 * Find a media link in an untrusted tool answer. Bounded in depth so a nested
 * provider document cannot hold this scan open.
 */
function mediaLinkFrom(value: unknown, depth = 0): GeneratedMediaLink | null {
  if (value == null || depth > 5) return null;
  if (typeof value === 'string') {
    const url = value.trim();
    return MEDIA_FILE_URL.test(url) ? { url } : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = mediaLinkFrom(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const object = value as Record<string, unknown>;
  const candidate =
    object.url ?? object.imageUrl ?? object.videoUrl ?? object.mediaUrl ?? object.href;
  if (typeof candidate === 'string') {
    const declared = object.mimeType ?? object.type;
    const mimeType = typeof declared === 'string' ? declared : undefined;
    const found = mediaLinkFrom(candidate, depth + 1);
    if (found) {
      return { ...found, ...(mimeType ? { mimeType } : {}) };
    }
    // A provider may hand back a signed link with no file extension beside a
    // declared MIME. That is still a file, and the egress policy — not the file
    // name — decides whether we may fetch it.
    if (candidate.startsWith('https://') && mimeType && chatMediaKindForMime(mimeType) !== null) {
      return { url: candidate, mimeType };
    }
  }
  for (const item of Object.values(object)) {
    const found = mediaLinkFrom(item, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The object's extension, from what the vendor said it was. */
function extensionFor(mimeType: string, kind: 'image' | 'video'): string {
  const subtype = mimeType.toLowerCase().split('/')[1]?.split(';')[0] ?? '';
  if (subtype === 'jpeg' || subtype === 'jpg') return 'jpg';
  if (subtype === 'svg+xml' || !/^[a-z0-9]+$/.test(subtype)) {
    return kind === 'video' ? 'webm' : 'png';
  }
  return subtype;
}

export async function storeGeneratedMedia({
  apps,
  attachments,
  userId,
  connectionId,
  conversationId,
  result,
  signal,
}: {
  apps: Pick<McpAppToolsService, 'fetchMedia'>;
  attachments: Pick<ChatAttachmentStorage, 'upload'>;
  userId: string;
  connectionId: string;
  conversationId: string;
  result: unknown;
  signal?: AbortSignal;
}): Promise<GeneratedMediaOutcome> {
  const envelope = result as { isError?: unknown; structured?: unknown; content?: unknown } | null;
  if (!envelope || typeof envelope !== 'object') return { status: 'none' };
  if (envelope.isError === true) return { status: 'failed' };

  const link = mediaLinkFrom(envelope.structured) ?? mediaLinkFrom(envelope.content);
  if (!link) return { status: 'none' };

  try {
    const fetched = await apps.fetchMedia({ userId, connectionId, url: link.url, signal });
    const mimeType =
      fetched.mimeType || link.mimeType || mimeFromUrl(link.url) || 'application/octet-stream';
    const kind = chatMediaKindForMime(mimeType);
    if (
      !kind ||
      fetched.bytes.byteLength === 0 ||
      fetched.bytes.byteLength > CHAT_MEDIA_MAX_BYTES
    ) {
      return { status: 'failed' };
    }

    // The path begins with the conversation id: the route that signs it pins
    // that same prefix, so a member cannot borrow a URL from another thread.
    const storagePath = `${conversationId}/generated/${randomUUID()}.${extensionFor(mimeType, kind)}`;
    const stored = await attachments.upload(storagePath, fetched.bytes, mimeType);
    if (!stored) return { status: 'failed' };

    const query = new URLSearchParams({ conversationId, path: storagePath });
    return {
      status: 'ok',
      media: { kind, url: `${CHAT_MEDIA_ROUTE}?${query.toString()}`, mimeType },
    };
  } catch (error) {
    logger.warn('Assistant app media could not be stored', { error: String(error) });
    return { status: 'failed' };
  }
}
