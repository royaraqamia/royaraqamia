import type { Bookmark, QuranSyncSnapshot, ReadingPosition } from '@/shared/contracts/quran';

/**
 * The client's half of every owned write (ADR-0029): `clientId` is the id the
 * device minted, recorded on the row as the last writer, and `updatedAt` is the
 * write time last-write-wins compares. Both are optional in the transport
 * because a non-replayed write (a first sign-in push) has no queue behind it.
 */
export interface QuranWriteMeta {
  clientId?: string | null;
  updatedAt?: string;
}

/** A Bookmark write: the pair, plus the tombstone an unmark carries. */
export interface QuranBookmarkWrite {
  surah: number;
  ayah: number;
  /** ISO instant to unmark, `null` to mark or re-mark. */
  deletedAt?: string | null;
}

/**
 * The Quran's only server-side records, and the whole of its sync (ADR-0056).
 *
 * Both tables key on a natural identity — one position per reader, one Bookmark
 * per reader per Ayah — so these are upserts against those keys, never inserts
 * of new identities. Nothing here knows about Realtime, the Local Store or the
 * Outbox: a pull since a cursor and two idempotent writes are the contract.
 */
export interface QuranSyncRepository {
  /** Every owned record, Bookmark tombstones included, from `since` onward. */
  getSyncSnapshot(userId: string, since?: string | null): Promise<QuranSyncSnapshot>;
  /**
   * The row that holds an Ayah's natural key, tombstones included: a replay is
   * an update of this row, while an absent or tombstoned row is what a mark has
   * to take a slot for (ADR-0075).
   */
  getBookmark(userId: string, surah: number, ayah: number): Promise<Bookmark | null>;
  /** Moves the reader's place. An older replay is dropped, not applied. */
  saveReadingPosition(
    userId: string,
    position: Omit<ReadingPosition, 'updatedAt'>,
    meta?: QuranWriteMeta
  ): Promise<void>;
  /** Marks or tombstones one Ayah, reviving the row that already holds its key. */
  setBookmark(userId: string, bookmark: QuranBookmarkWrite, meta?: QuranWriteMeta): Promise<void>;
}
