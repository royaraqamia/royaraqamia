import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type {
  QuranBookmarkWrite,
  QuranSyncRepository,
  QuranWriteMeta,
} from '@/backend/repositories/quran/quran-sync-repository';
import { guardRepositoryMethods } from '@/backend/shared/repository-error';
import type { Bookmark, QuranSyncSnapshot } from '@/shared/contracts/quran';

type PositionRow = Database['public']['Tables']['quran_reading_positions']['Row'];
type BookmarkRow = Database['public']['Tables']['quran_bookmarks']['Row'];

const nowIso = () => new Date().toISOString();

/**
 * One shape for an instant on both sides of the wire.
 *
 * A device writes `toISOString()` (`Z`) and Postgres renders a `timestamptz` as
 * `+00:00`, so without this the same write would come back looking different
 * from the one the Local Store holds — and a merge that compares strings would
 * see a change on every pull. Milliseconds are all a device ever sends, so
 * normalising cannot lose a write.
 */
function instant(value: string): string {
  return new Date(value).toISOString();
}

/**
 * True when the stored write is newer than the replayed one, so the replay is
 * dropped (ADR-0029). A write with no time is always applied: it is either a
 * first write or one the server stamps itself.
 */
function storedIsNewer(stored: string | null, incoming: string | undefined): boolean {
  if (!stored || !incoming) return false;
  return new Date(stored).getTime() > new Date(incoming).getTime();
}

/**
 * Surfaces the record the contract and the Local Store hold, dropping the
 * columns the device has no use for (`id`, `user_id`, `server_updated_at`, which
 * is the cursor's business).
 *
 * A row written outside this API has no `client_id`. Its server id is then the
 * only stable key it has, and it is returned rather than the row being dropped:
 * a mark with an odd key is still a mark the reader made.
 */
function toBookmark(row: BookmarkRow): Bookmark {
  return {
    clientId: row.client_id ?? row.id,
    surah: row.surah,
    ayah: row.ayah,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    deletedAt: row.deleted_at ? instant(row.deleted_at) : null,
  };
}

/**
 * The pull's cursor: the newest stamp in the page, or the one it started from.
 * Both tables are read in the same pass, so the page cannot leave a stamp
 * behind for the next pull to skip (no whole-set re-scan, no gap).
 */
function newestCursor(
  stamps: Array<string | null | undefined>,
  since?: string | null
): string | null {
  let cursor = since ?? null;
  for (const stamp of stamps) {
    if (typeof stamp === 'string' && (cursor === null || stamp > cursor)) cursor = stamp;
  }
  return cursor;
}

export function createQuranSyncRepository(supabase: SupabaseClient<Database>): QuranSyncRepository {
  return guardRepositoryMethods<QuranSyncRepository>({
    async getSyncSnapshot(userId: string, since?: string | null): Promise<QuranSyncSnapshot> {
      // The Position is read without a `deleted_at` filter on purpose: nothing in
      // the API tombstones it, but if a row ever is, the pull has to carry the
      // removal instead of silently keeping a place the server says is gone.
      let positionQuery = supabase
        .from('quran_reading_positions')
        .select('*')
        .eq('user_id', userId);
      let bookmarksQuery = supabase.from('quran_bookmarks').select('*').eq('user_id', userId);
      if (since) {
        positionQuery = positionQuery.gt('server_updated_at', since);
        bookmarksQuery = bookmarksQuery.gt('server_updated_at', since);
      }

      // Deliberately unfiltered by `deleted_at`: a tombstone is the only way
      // another device learns the mark is gone.
      const [position, bookmarks] = await Promise.all([
        positionQuery.maybeSingle(),
        bookmarksQuery,
      ]);

      const positionRow = position.data as PositionRow | null;
      const bookmarkRows = (bookmarks.data ?? []) as BookmarkRow[];

      return {
        position:
          positionRow && !positionRow.deleted_at
            ? {
                surah: positionRow.surah,
                ayah: positionRow.ayah,
                updatedAt: instant(positionRow.updated_at),
              }
            : null,
        bookmarks: bookmarkRows.map(toBookmark),
        cursor: newestCursor(
          [positionRow?.server_updated_at, ...bookmarkRows.map((row) => row.server_updated_at)],
          since
        ),
      };
    },

    async saveReadingPosition(
      userId: string,
      position: { surah: number; ayah: number },
      meta?: QuranWriteMeta
    ): Promise<void> {
      const stamp = meta?.updatedAt ?? nowIso();

      // The row is the reader's only one, so the replay target is `user_id` — the
      // same natural key the table's unique constraint uses.
      const { data: existing, error: readError } = await supabase
        .from('quran_reading_positions')
        .select('id, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);

      if (existing) {
        // Last-write-wins: a queued position older than the stored one must not
        // move the reader back (ADR-0029).
        if (storedIsNewer((existing as PositionRow).updated_at, meta?.updatedAt)) return;

        const update: Database['public']['Tables']['quran_reading_positions']['Update'] = {
          surah: position.surah,
          ayah: position.ayah,
          updated_at: stamp,
          deleted_at: null,
        };
        if (meta?.clientId) update.client_id = meta.clientId;

        const { error } = await supabase
          .from('quran_reading_positions')
          .update(update)
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from('quran_reading_positions').insert({
        user_id: userId,
        surah: position.surah,
        ayah: position.ayah,
        client_id: meta?.clientId ?? null,
        updated_at: stamp,
      });
      if (error) throw new Error(error.message);
    },

    async setBookmark(
      userId: string,
      bookmark: QuranBookmarkWrite,
      meta?: QuranWriteMeta
    ): Promise<void> {
      const stamp = meta?.updatedAt ?? nowIso();

      // The read includes tombstones: re-marking an Ayah must revive the row that
      // still occupies (user_id, surah, ayah) rather than insert a second one,
      // which the unique constraint would refuse (ADR-0056).
      const { data: existing, error: readError } = await supabase
        .from('quran_bookmarks')
        .select('id, updated_at')
        .eq('user_id', userId)
        .eq('surah', bookmark.surah)
        .eq('ayah', bookmark.ayah)
        .maybeSingle();
      if (readError) throw new Error(readError.message);

      if (existing) {
        // A replayed toggle older than the stored state must not undo a newer one.
        if (storedIsNewer((existing as BookmarkRow).updated_at, meta?.updatedAt)) return;

        const update: Database['public']['Tables']['quran_bookmarks']['Update'] = {
          deleted_at: bookmark.deletedAt ?? null,
          updated_at: stamp,
        };
        if (meta?.clientId) update.client_id = meta.clientId;

        const { error } = await supabase
          .from('quran_bookmarks')
          .update(update)
          .eq('id', (existing as BookmarkRow).id);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from('quran_bookmarks').insert({
        user_id: userId,
        surah: bookmark.surah,
        ayah: bookmark.ayah,
        client_id: meta?.clientId ?? null,
        updated_at: stamp,
        deleted_at: bookmark.deletedAt ?? null,
      });
      if (error) throw new Error(error.message);
    },
  });
}
