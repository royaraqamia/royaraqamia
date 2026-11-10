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
 * `{conversationId}/{uuid}/file.{ext}`: the first folder is the thread, which is
 * what the policy reads, the uuid keeps two files of the same name apart, and the
 * object's last segment is never the member's own name — a storage key is ASCII,
 * so an Arabic name there is `400 InvalidKey` (#1241). The name they chose is the
 * row's `fileName`, which is what the thread and the download use.
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

/**
 * The name the row keeps: the member's own, trimmed and inside the column's
 * bound. Unicode is the point — a file called `فاتورة-472.pdf` is a file with a
 * name, and only the object key has to give it up.
 */
export function chatAttachmentFileName(fileName: string): string {
  return (fileName.trim() || 'file').slice(0, 200);
}

/**
 * The object's last segment: a flat ASCII name carrying the member's extension
 * and nothing else. A storage key cannot hold their name (#1241), and it does
 * not need to — `chatAttachmentFileName` is what the row, the thread and the
 * download read.
 */
export function chatAttachmentObjectPath(conversationId: string, fileName: string): string {
  return `${conversationId}/${crypto.randomUUID()}/file${chatAttachmentExtension(fileName)}`;
}

/** The extension the key keeps, and only when a key can carry it. */
export function chatAttachmentExtension(fileName: string): string {
  const extension = /\.([a-zA-Z0-9]{1,10})$/.exec(fileName.trim())?.[1];
  return extension ? `.${extension.toLowerCase()}` : '';
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

  const fileName = chatAttachmentFileName(meta.fileName);
  const storagePath = chatAttachmentObjectPath(conversationId, fileName);
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
