import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENTS_BUCKET,
  type ChatAttachmentInput,
} from '@/shared/contracts/chat';
import { createClient } from '@/frontend/transport/supabase/client';
import { logger } from '@/frontend/shared/logger';

/**
 * The upload path, and the only place the browser names an object.
 *
 * The file goes up on the session's own client, so the bucket's policy — "a
 * member of this thread" — is what admits it, and the message that follows
 * carries the metadata rather than the bytes. The path is
 * `{conversationId}/{uuid}/{fileName}`: the first folder is the thread, which is
 * what the policy reads, and the uuid keeps two files of the same name apart.
 */

/** The sentence the composer shows for a file the bucket would refuse. */
export const CHAT_ATTACHMENT_TOO_LARGE = 'حجم الملف يتجاوز 25 ميغابايت، اختر ملفاً أصغر';

export class ChatAttachmentUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatAttachmentUploadError';
  }
}

/**
 * Checked before the upload, so an oversized pick never spends a byte of it.
 * The limit is the allowance the server reports (10 MB on Free); the default is
 * the contract's absolute ceiling, which is what the upload itself refuses.
 */
export function isChatAttachmentTooLarge(
  file: { size: number },
  limitBytes: number = CHAT_ATTACHMENT_MAX_BYTES
): boolean {
  return file.size > limitBytes;
}

/** A flat name: a separator would add a folder the path guard refuses. */
export function chatAttachmentObjectName(fileName: string): string {
  const flat = fileName
    .replace(/[\\/]/g, '-')
    // Control characters would ride into a path and a header; nothing visible
    // needs them, so they are dropped rather than escaped.
    .split('')
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .trim();

  return (flat || 'file').slice(0, 200);
}

/** What the object is called once it is in the bucket, and what it claims to be. */
export interface ChatAttachmentBlobMeta {
  fileName: string;
  mimeType: string;
}

/**
 * The upload itself, over bytes rather than a `File`: a queued line keeps a
 * `Blob` in the device's media store and hands it here on replay (#1033). A
 * `File` is a `Blob`, so the direct online path goes through the same function.
 */
export async function uploadChatAttachmentBlob(
  conversationId: string,
  blob: Blob,
  meta: ChatAttachmentBlobMeta
): Promise<ChatAttachmentInput> {
  if (isChatAttachmentTooLarge(blob))
    throw new ChatAttachmentUploadError(CHAT_ATTACHMENT_TOO_LARGE);

  const fileName = chatAttachmentObjectName(meta.fileName);
  const storagePath = `${conversationId}/${crypto.randomUUID()}/${fileName}`;
  const mimeType = meta.mimeType || 'application/octet-stream';

  const supabase = await createClient();
  const { error } = await supabase.storage
    .from(CHAT_ATTACHMENTS_BUCKET)
    .upload(storagePath, blob, { cacheControl: '3600', upsert: false, contentType: mimeType });

  if (error) {
    logger.error('chat attachment upload failed', { conversationId, cause: error.message });
    throw new ChatAttachmentUploadError('تعذّر رفع الملف');
  }

  return { storagePath, fileName, mimeType, byteSize: blob.size };
}

export async function uploadChatAttachment(
  conversationId: string,
  file: File
): Promise<ChatAttachmentInput> {
  return uploadChatAttachmentBlob(conversationId, file, {
    fileName: file.name,
    mimeType: file.type,
  });
}

/**
 * Undo an upload that will never become a message. Best-effort on purpose: the
 * send has already failed, and a second error over the first helps nobody — the
 * daily sweep is what catches an object this could not remove.
 */
export async function removeChatAttachmentObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  try {
    const supabase = await createClient();
    const { error } = await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).remove(paths);
    if (error) logger.warn('chat attachment cleanup failed', { cause: error.message });
  } catch (error) {
    logger.warn('chat attachment cleanup threw', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
