import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { CHAT_ATTACHMENTS_BUCKET } from '@/shared/contracts/chat';
import { logger } from '@/backend/shared/logger';
import { repositoryFailure } from '@/backend/shared/repository-error';

/**
 * The sweep's data access, on the service role: it has to see objects no member
 * named, which is exactly what RLS cannot answer. It never reads a message, only
 * paths — an orphan is a file, not a conversation.
 */
export interface ChatAttachmentObject {
  path: string;
  /** When the object last changed, or null when storage did not say. */
  updatedAt: string | null;
}

export interface ChatAttachmentSweepRepository {
  /** Every path a row still claims. */
  listReferencedPaths(): Promise<Set<string>>;
  /** Objects under the bucket, up to `limit`, depth-first. */
  listObjects(limit: number): Promise<{ objects: ChatAttachmentObject[]; truncated: boolean }>;
  removeObjects(paths: string[]): Promise<void>;
}

const PAGE_SIZE = 1000;

type StorageObject = {
  name: string;
  id: string | null;
  updated_at?: string;
  created_at?: string;
};

export function createChatAttachmentSweepRepository(
  supabase: SupabaseClient<Database>
): ChatAttachmentSweepRepository {
  const storage = supabase.storage.from(CHAT_ATTACHMENTS_BUCKET);

  return {
    async listReferencedPaths() {
      const paths = new Set<string>();

      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('chat_attachments')
          .select('storage_path')
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw repositoryFailure('chat.sweep.listReferencedPaths', error);

        const rows = data ?? [];
        for (const row of rows) paths.add(row.storage_path);
        if (rows.length < PAGE_SIZE) break;
      }

      return paths;
    },

    async listObjects(limit) {
      const objects: ChatAttachmentObject[] = [];
      let truncated = false;

      // `{conversationId}/{uuid}/{fileName}`: three levels, so the walk is a
      // folder listing at each one and storage has no recursive call.
      const walk = async (prefix: string, depth: number): Promise<void> => {
        const { data, error } = await storage.list(prefix, { limit: PAGE_SIZE });
        if (error) throw repositoryFailure('chat.sweep.listObjects', error);

        for (const entry of (data ?? []) as StorageObject[]) {
          if (objects.length >= limit) {
            truncated = true;
            return;
          }

          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.id === null) {
            // A folder: the conversation, then the object's own uuid.
            if (depth < 3) await walk(path, depth + 1);
            continue;
          }

          objects.push({
            path,
            updatedAt: entry.updated_at ?? entry.created_at ?? null,
          });
        }
      };

      await walk('', 1);
      return { objects, truncated };
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
