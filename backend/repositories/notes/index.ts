import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type {
  NoteWrite,
  NoteWriteMeta,
  NotesRepository,
} from '@/backend/repositories/notes/notes-repository';
import { guardRepositoryMethods } from '@/backend/shared/repository-error';
import type { Note, NotesSyncSnapshot } from '@/shared/contracts/notes';

type NoteRow = Database['public']['Tables']['notes']['Row'];

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

/** The record the contract and the Local Store hold, dropping server columns. */
function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    clientId: row.client_id ?? row.id,
    title: row.title,
    body: row.body,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    deletedAt: row.deleted_at ? instant(row.deleted_at) : null,
  };
}

/** The pull's cursor: the newest stamp in the page, or the one it started from. */
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

export function createNotesRepository(supabase: SupabaseClient<Database>): NotesRepository {
  return guardRepositoryMethods<NotesRepository>({
    async getSyncSnapshot(userId: string, since?: string | null): Promise<NotesSyncSnapshot> {
      let query = supabase.from('notes').select('*').eq('user_id', userId);
      if (since) query = query.gt('server_updated_at', since);

      // Deliberately unfiltered by `deleted_at`: a tombstone is the only way
      // another device learns the note is gone.
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as NoteRow[];
      return {
        notes: rows.map(toNote),
        cursor: newestCursor(
          rows.map((row) => row.server_updated_at),
          since
        ),
      };
    },

    async getNote(userId: string, id: string): Promise<Note | null> {
      // Tombstones are included on purpose: an edit of a live note is an update,
      // but one on a tombstone revives it and takes a slot (ADR-0075).
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);

      return data ? toNote(data as NoteRow) : null;
    },

    async saveNote(
      userId: string,
      id: string,
      note: NoteWrite,
      meta?: NoteWriteMeta
    ): Promise<void> {
      const stamp = meta?.updatedAt ?? nowIso();

      const { data: existing, error: readError } = await supabase
        .from('notes')
        .select('id, updated_at')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();
      if (readError) throw new Error(readError.message);

      if (existing) {
        // Last-write-wins: a queued edit older than the stored one must not
        // undo a newer one (ADR-0029).
        if (storedIsNewer((existing as NoteRow).updated_at, meta?.updatedAt)) return;

        const update: Database['public']['Tables']['notes']['Update'] = {
          title: note.title,
          body: note.body,
          updated_at: stamp,
        };
        if ('deletedAt' in note) update.deleted_at = note.deletedAt ?? null;
        if (meta?.clientId) update.client_id = meta.clientId;

        const { error } = await supabase
          .from('notes')
          .update(update)
          .eq('user_id', userId)
          .eq('id', id);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from('notes').insert({
        id,
        user_id: userId,
        client_id: meta?.clientId ?? id,
        title: note.title,
        body: note.body,
        created_at: note.createdAt ?? stamp,
        updated_at: stamp,
        deleted_at: note.deletedAt ?? null,
      });
      if (error) throw new Error(error.message);
    },

    async deleteNote(userId: string, id: string, meta?: NoteWriteMeta): Promise<void> {
      const stamp = meta?.updatedAt ?? nowIso();

      // A delete only ever follows the create that owns the row: the Outbox
      // replays in write order, so there is nothing to insert here. A note whose
      // create failed permanently leaves this a no-op, which is the safe answer.
      const { error } = await supabase
        .from('notes')
        .update({ deleted_at: stamp, updated_at: stamp })
        .eq('user_id', userId)
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
  });
}
