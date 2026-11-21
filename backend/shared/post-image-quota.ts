/**
 * The two sentences `private.enforce_post_image_quota` can raise, keyed by the
 * exact text of the exception (20261219000000). Keeping the keys here lets the
 * repository name a refusal and the service answer in the product's voice, the
 * same split `backend/services/chat/chat-service.ts` uses for attachments.
 */
export const POST_IMAGE_QUOTA_REFUSALS = {
  'post image member storage is full': 'تخزين صورك ممتلئ، احذف صورة قديمة ثم أعد المحاولة',
  'post image project storage is full': 'تخزين الصور في الموقع ممتلئ، حاول لاحقاً',
} as const;

export type PostImageQuotaReason = keyof typeof POST_IMAGE_QUOTA_REFUSALS;

/** The trigger's message, which Storage may wrap in a longer error string. */
export function postImageQuotaReason(message: string | undefined): PostImageQuotaReason | null {
  if (!message) return null;
  return (
    (Object.keys(POST_IMAGE_QUOTA_REFUSALS) as PostImageQuotaReason[]).find((reason) =>
      message.includes(reason)
    ) ?? null
  );
}
