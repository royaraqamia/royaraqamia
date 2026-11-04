import { formatAttachmentSize } from '@/frontend/shared/format-bytes';
import { isChatAttachmentTooLarge } from '@/frontend/transport/supabase/chat-attachments';
import {
  CHAT_ATTACHMENTS_PER_MESSAGE_MAX,
  type ChatAttachmentQuota,
} from '@/shared/contracts/chat';

/**
 * The refusals both composers show before a file is staged (ADR-0113,
 * ADR-0127). They live here so the member's thread and the assistant's cannot
 * refuse the same file in two different sentences.
 */
export const ATTACHMENT_REFUSALS = {
  tooLarge: (limitBytes: number) =>
    `حجم الملف يتجاوز ${formatAttachmentSize(limitBytes)}، اختر ملفاً أصغر`,
  tooMany: 'خمسة مرفقات في الرسالة الواحدة',
  today: 'بلغت حدّ المرفقات اليوم، يعود غداً',
  total: 'مساحة مرفقاتك ممتلئة، احذف رسالة قديمة فيها ملفات',
  project: 'مساحة مرفقات الموقع ممتلئة، حاول لاحقاً',
} as const;

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
