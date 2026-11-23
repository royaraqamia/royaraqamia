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
  /**
   * Store bytes the assistant produced through a member's connected app
   * (ADR-0216). The caller owns the path and the MIME check; this method only
   * puts the object in the same private bucket every other attachment uses, so
   * the bucket's own RLS and the daily sweep own it from here on.
   */
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<boolean>;
  /** The object's bytes, for a turn that has to read them (a voice note). */
  download(path: string): Promise<Uint8Array | null>;
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

    async upload(path, bytes, contentType) {
      const { error } = await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).upload(path, bytes, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      });

      if (error) {
        logger.warn('chat attachment upload failed', { path, cause: error.message });
        return false;
      }
      return true;
    },

    async download(path) {
      const { data, error } = await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).download(path);

      if (error || !data) {
        logger.warn('chat attachment download failed', { path, cause: error?.message });
        return null;
      }
      return new Uint8Array(await data.arrayBuffer());
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
