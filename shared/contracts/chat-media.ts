import { z } from 'zod';

/**
 * A picture or clip a member generated through a connected app (ADR-0216).
 *
 * The vendor's bytes are fetched by the server with the member's own encrypted
 * connector token and stored in `chat-attachments`. What crosses to the browser
 * is only this descriptor: a same-origin route that mints a fresh signed URL on
 * every read, the kind, and the MIME type. No vendor token and no vendor link is
 * ever given to a client, so a thread reopened tomorrow draws from our bucket.
 *
 * This is the paid lane. A drawing the assistant writes itself stays the free
 * SVG lane in ADR-0215 and never becomes one of these rows.
 */

export const CHAT_MEDIA_KINDS = ['image', 'video'] as const;

/** The bucket's own per-file ceiling: a 25 MB object (ADR-0113). */
export const CHAT_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

/** The one route that turns a stored object into a short-lived signed URL. */
export const CHAT_MEDIA_ROUTE = '/api/chats/media';

/**
 * The curated catalogue rows whose tools can produce billable media. Only these
 * get their results interpreted as a picture or a clip: a stranger's tool that
 * happens to return an error must never borrow this lane's sentence.
 */
export const HIGGSFIELD_REGISTRY_NAME = 'io.higgsfield/mcp';
export const MEDIA_APP_REGISTRY_NAMES: readonly string[] = [HIGGSFIELD_REGISTRY_NAME];

export const ChatMediaSchema = z.strictObject({
  kind: z.enum(CHAT_MEDIA_KINDS),
  /** Same-origin, never a vendor URL: see `CHAT_MEDIA_ROUTE`. */
  url: z.string().min(1).max(2048),
  mimeType: z.string().min(1).max(120),
});

export type ChatMedia = z.infer<typeof ChatMediaSchema>;

/** The formats a browser draws natively; SVG is excluded (it is a script). */
const RENDERABLE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
]);

export function chatMediaKindForMime(mimeType: string): 'image' | 'video' | null {
  const mime = mimeType.trim().toLowerCase().split(';')[0] ?? '';
  if (!RENDERABLE_MIME.has(mime)) return null;
  return mime.startsWith('video/') ? 'video' : 'image';
}

/** The one Arabic sentence a spent-credit or vendor refusal produces. */
export const CHAT_MEDIA_UNAVAILABLE =
  'تعذّر إنشاء الصورة أو الفيديو؛ رصيد التطبيق المرتبط غير كافٍ أو أن الخدمة رفضت الطلب.';

/** Alt text, from the same contract both clients read. */
export const CHAT_MEDIA_ALT: Record<'image' | 'video', string> = {
  image: 'صورة أنشأها التطبيق المرتبط',
  video: 'فيديو أنشأه التطبيق المرتبط',
};
