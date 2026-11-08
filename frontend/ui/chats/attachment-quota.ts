import { formatAttachmentSize } from '@/frontend/shared/format-bytes';
import { isChatAttachmentTooLarge } from '@/frontend/transport/supabase/chat-attachments';
import {
  CHAT_AGENT_DOCUMENTS_PER_TURN_MAX,
  CHAT_AGENT_IMAGES_PER_TURN_MAX,
  CHAT_ATTACHMENTS_PER_MESSAGE_MAX,
  chatAttachmentIsDocument,
  chatAttachmentIsInlineImage,
  type ChatAttachmentQuota,
} from '@/shared/contracts/chat';
import { CHAT_ATTACHMENTS_COPY } from './chat-attachments-copy';

/**
 * The refusals both composers show before a file is staged (ADR-0113,
 * ADR-0127). They live here so the member's thread and the assistant's cannot
 * refuse the same file in two different sentences.
 *
 * The allowance sentences come from `shared/copy/chat-attachments.json`, the same
 * source that generates the app's `ChatAttachmentsCopy` (#933), so the app's
 * refusal is the site's sentence rather than a retyped one. The turn's two bounds
 * stay inline because they belong to the assistant's composer, which the app
 * opens as the document.
 */
export const ATTACHMENT_REFUSALS = {
  tooLarge: (limitBytes: number) =>
    CHAT_ATTACHMENTS_COPY.tooLarge.replace('{size}', formatAttachmentSize(limitBytes)),
  tooMany: CHAT_ATTACHMENTS_COPY.tooMany,
  /** The turn's own bound: three pictures, because each one is a prompt (ADR-0139). */
  tooManyImages: 'ثلاث صور في السؤال الواحد، أرسل الباقي في سؤال آخر',
  /** The turn's other bound: one document, because it is read into the prompt (ADR-0140). */
  tooManyDocuments: 'مستند واحد في السؤال الواحد، أرسل الباقي في سؤال آخر',
  today: CHAT_ATTACHMENTS_COPY.today,
  total: CHAT_ATTACHMENTS_COPY.total,
  project: CHAT_ATTACHMENTS_COPY.project,
} as const;

/**
 * Whether a pick takes the turn past its picture bound. Counted before the
 * upload, so a fourth picture costs nothing; the contract refuses the same
 * count again on the server, for a client that skipped this (ADR-0139).
 */
export function exceedsImageLimit(
  current: File[],
  picked: File[],
  max: number = CHAT_AGENT_IMAGES_PER_TURN_MAX
): boolean {
  const images = [...current, ...picked].filter((file) =>
    chatAttachmentIsInlineImage(file.type)
  ).length;
  return images > max;
}

/**
 * The same count for the turn's documents, and for the same reason: a second
 * document spends its bytes before the server can say no (ADR-0140).
 */
export function exceedsDocumentLimit(
  current: File[],
  picked: File[],
  max: number = CHAT_AGENT_DOCUMENTS_PER_TURN_MAX
): boolean {
  const documents = [...current, ...picked].filter((file) =>
    chatAttachmentIsDocument(file.type)
  ).length;
  return documents > max;
}

/**
 * What a pick does to the staged list: the files to stage, or the one sentence
 * explaining why none of them was. Every check happens before an upload, so a
 * refused file never spends a byte of the allowance.
 */
export function stageFiles(
  current: File[],
  picked: File[],
  quota: ChatAttachmentQuota
): { files: File[] } | { refusal: string } {
  if (picked.length === 0) return { files: current };

  if (picked.some((file) => isChatAttachmentTooLarge(file, quota.fileBytes))) {
    return { refusal: ATTACHMENT_REFUSALS.tooLarge(quota.fileBytes) };
  }
  if (current.length + picked.length > CHAT_ATTACHMENTS_PER_MESSAGE_MAX) {
    return { refusal: ATTACHMENT_REFUSALS.tooMany };
  }

  const staged = [...current, ...picked];
  const bytes = staged.reduce((sum, file) => sum + file.size, 0);

  if (quota.today.usedBytes + bytes > quota.today.limitBytes) {
    return { refusal: ATTACHMENT_REFUSALS.today };
  }
  if (quota.total.usedBytes + bytes > quota.total.limitBytes) {
    return { refusal: ATTACHMENT_REFUSALS.total };
  }
  if (quota.project.usedBytes + bytes > quota.project.limitBytes) {
    return { refusal: ATTACHMENT_REFUSALS.project };
  }

  return { files: staged };
}
