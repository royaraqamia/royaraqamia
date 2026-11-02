import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { CHAT_ATTACHMENTS_BUCKET } from '@/shared/contracts/chat';
import { logger } from '@/backend/shared/logger';

/**
 * How long a signed URL lives. Long enough for the click that asked for it,
 * short enough that a URL copied out of a response is worthless by the time it
 * is used anywhere else — the client never holds the bucket path, only this.
 */
export const CHAT_ATTACHMENT_URL_TTL_SECONDS = 60;

export interface ChatAttachmentStorage {
  /**
   * A short-lived URL for one object. `download` names the file and asks storage
   * for `Content-Disposition: attachment`; `null` leaves it inline, which only a
   * drawing-safe image ever asks for.
   */
  signedUrl(path: string, download: string | null): Promise<string | null>;
  /** Best-effort: a failed remove is logged, never rethrown over the row delete. */
  remove(paths: string[]): Promise<void>;
}

export function createChatAttachmentStorage(
  supabase: SupabaseClient<Database>
): ChatAttachmentStorage {
  return {
    async signedUrl(path, download) {
      const { data, error } = await supabase.storage
        .from(CHAT_ATTACHMENTS_BUCKET)
        .createSignedUrl(
          path,
          CHAT_ATTACHMENT_URL_TTL_SECONDS,
          download ? { download } : undefined
        );

      if (error) {
        logger.error('chat attachment signing failed', { path, cause: error.message });
        return null;
      }
      return data?.signedUrl ?? null;
    },

    async remove(paths) {
      if (paths.length === 0) return;

      const { error } = await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).remove(paths);
      if (error) {
        // The row is gone either way; the daily sweep is what picks the object up.
        logger.warn('chat attachment object removal failed', {
          count: paths.length,
          cause: error.message,
        });
      }
    },
  };
}
