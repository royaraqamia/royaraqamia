import type { Note, NotesSyncSnapshot } from '@/shared/contracts/notes';

/**
 * The client's half of an owned write (ADR-0029): `clientId` is the id the
 * device minted — and the row's primary key on both sides — while `updatedAt`
 * is the write time last-write-wins compares. A non-replayed write (a first
 * sign-in push) has no queue behind it, so both are optional.
 */
export interface NoteWriteMeta {
  clientId?: string | null;
  updatedAt?: string;
}

/** A create or an edit: the rendered fields plus its tombstone decision. */
export interface NoteWrite {
  title: string;
  body: string;
  createdAt?: string;
  /** `null` clears a tombstone (an undo); a timestamp tombstones the row. */
  deletedAt?: string | null;
}

/**
 * Notes' only server-side record and the whole of its sync (ADR-0092).
 *
 * A note is identified by the client-minted id, so these are idempotent upserts
 * against that key, never inserts of new identities. Nothing here knows about
 * Realtime, the Local Store or the Outbox: a pull since a cursor and two
 * writes are the contract.
 */
export interface NotesRepository {
  /** Every owned note, tombstones included, from `since` onward. */
  getSyncSnapshot(userId: string, since?: string | null): Promise<NotesSyncSnapshot>;
  /**
   * One note, tombstone included — the fact the cap check needs to tell an
   * idempotent replay, a revival, and a new note apart (ADR-0075).
   */
  getNote(userId: string, id: string): Promise<Note | null>;
  /** Creates or edits one note; an older replay is dropped, not applied. */
  saveNote(userId: string, id: string, note: NoteWrite, meta?: NoteWriteMeta): Promise<void>;
  /** Tombstones one note. A note that never reached the server is a no-op. */
  deleteNote(userId: string, id: string, meta?: NoteWriteMeta): Promise<void>;
}
