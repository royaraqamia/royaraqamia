import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { CHAT_ATTACHMENTS_BUCKET } from '@/shared/contracts/chat';
import { logger } from '@/backend/shared/logger';
import { repositoryFailure } from '@/backend/shared/repository-error';

/**
 * The sweep's data access, on the service role: it has to see objects no member
 * named, which is exactly what RLS cannot answer. It never reads a message, only
 * paths and sizes — an orphan is a file, not a conversation.
 *
 * The bucket is walked by keyset over `storage.objects`, not by listing folders:
 * a folder listing has no cursor and fills its first page with conversation
 * names long before the objects behind them are reached (#1701).
 */
export interface ChatAttachmentObject {
  path: string;
  /** When the object last changed, or null when storage did not say. */
  updatedAt: string | null;
  /** What the object actually occupies, for the reconciliation the rows miss. */
  sizeBytes: number;
}

/** Where the last run stopped. An empty path means the bucket's head. */
export interface ChatAttachmentSweepCursor {
  lastPath: string;
  sweptAt: string;
}

export interface ChatAttachmentSweepPage {
  objects: ChatAttachmentObject[];
  /** False when the page filled and more objects may follow. */
  complete: boolean;
}

/** What Storage holds beside what the quota's rows count. */
export interface ChatAttachmentSweepStats {
  bucketObjects: number;
  bucketBytes: number;
  rowObjects: number;
  rowBytes: number;
}

export interface ChatAttachmentSweepRepository {
  /** Every path a row still claims. */
  listReferencedPaths(): Promise<Set<string>>;
  /** Objects with a name strictly after `after`, ordered by name. */
  listPage(after: string, limit: number): Promise<ChatAttachmentSweepPage>;
  /** The cursor the previous run left, or null on a bucket never swept. */
  readCursor(): Promise<ChatAttachmentSweepCursor | null>;
  /** Persist the position, including the cleared position of a full drain. */
  writeCursor(cursor: ChatAttachmentSweepCursor): Promise<void>;
  stats(): Promise<ChatAttachmentSweepStats>;
  removeObjects(paths: string[]): Promise<void>;
}

const REFERENCED_PAGE_SIZE = 1000;

type StoragePageRow = {
  name: string;
  updated_at: string | null;
  size_bytes: number | null;
};

type StatsRow = {
  bucket_objects: number | null;
  bucket_bytes: number | null;
  row_objects: number | null;
  row_bytes: number | null;
};

export function createChatAttachmentSweepRepository(
  supabase: SupabaseClient<Database>
): ChatAttachmentSweepRepository {
  const storage = supabase.storage.from(CHAT_ATTACHMENTS_BUCKET);

  return {
    async listReferencedPaths() {
      const paths = new Set<string>();

      for (let from = 0; ; from += REFERENCED_PAGE_SIZE) {
        const { data, error } = await supabase
          .from('chat_attachments')
          .select('storage_path')
          .range(from, from + REFERENCED_PAGE_SIZE - 1);

        if (error) throw repositoryFailure('chat.sweep.listReferencedPaths', error);

        const rows = data ?? [];
        for (const row of rows) paths.add(row.storage_path);
        if (rows.length < REFERENCED_PAGE_SIZE) break;
      }

      return paths;
    },

    async listPage(after, limit) {
      const { data, error } = await supabase.rpc('chat_attachment_sweep_page', {
        p_after: after,
        p_limit: limit,
      });
      if (error) throw repositoryFailure('chat.sweep.listPage', error);

      const rows = (data ?? []) as StoragePageRow[];
      return {
        objects: rows.map((row) => ({
          path: row.name,
          updatedAt: row.updated_at,
          sizeBytes: Number(row.size_bytes ?? 0),
        })),
        complete: rows.length < limit,
      };
    },

    async readCursor() {
      const { data, error } = await supabase
        .from('chat_attachment_sweep_state')
        .select('last_path, swept_at')
        .eq('bucket', CHAT_ATTACHMENTS_BUCKET)
        .maybeSingle();
      if (error) throw repositoryFailure('chat.sweep.readCursor', error);
      if (!data) return null;

      return {
        lastPath: data.last_path,
        sweptAt: data.swept_at ?? new Date(0).toISOString(),
      };
    },

    async writeCursor(cursor) {
      const { error } = await supabase.from('chat_attachment_sweep_state').upsert(
        {
          bucket: CHAT_ATTACHMENTS_BUCKET,
          last_path: cursor.lastPath,
          swept_at: cursor.sweptAt,
        },
        { onConflict: 'bucket' }
      );
      if (error) throw repositoryFailure('chat.sweep.writeCursor', error);
    },

    async stats() {
      const { data, error } = await supabase.rpc('chat_attachment_sweep_stats');
      if (error) throw repositoryFailure('chat.sweep.stats', error);

      const row = (data ?? [])[0] as StatsRow | undefined;
      if (!row) throw repositoryFailure('chat.sweep.stats', new Error('no stats row returned'));

      return {
        bucketObjects: Number(row.bucket_objects ?? 0),
        bucketBytes: Number(row.bucket_bytes ?? 0),
        rowObjects: Number(row.row_objects ?? 0),
        rowBytes: Number(row.row_bytes ?? 0),
      };
    },

    async removeObjects(paths) {
      if (paths.length === 0) return;

      const { error } = await storage.remove(paths);
      if (error) {
        logger.error('chat attachment sweep removal failed', {
          count: paths.length,
          cause: error.message,
        });
      }
    },
  };
}
