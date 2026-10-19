/**
 * The Quran Reader's vendored data, as `public/quran/**` stores it.
 *
 * These types describe files produced by `scripts/vendor-quran.mjs`, not an API
 * response: the text is copied from Tanzil under CC BY 3.0 and never altered
 * (ADR-0057), so the field names are Tanzil's and the ayah strings are verbatim.
 *
 * The bottom of the file is the exception: the two records a reader owns (a
 * Reading position and a Bookmark) are the device's, not the text's, and the
 * schemas below are what the sync API validates them against (ADR-0056).
 */

import { z } from 'zod';

/** One sura as the index lists it. */
export interface SurahSummary {
  /** Tanzil's 1-based sura number, which is also the reader's only route param. */
  n: number;
  /** The sura's Arabic name, e.g. البقرة. */
  name: string;
  ayahCount: number;
  /** Tanzil's word for it; the reader renders مكية or مدنية from it. */
  revelation: 'Meccan' | 'Medinan';
  /** Where the sura falls in the order of revelation, not the order of the text. */
  revelationOrder: number;
}

export interface QuranIndex {
  source: string;
  license: string;
  /** The path of the verbatim Tanzil notice, which the licence requires us to keep. */
  notice: string;
  rivayah: string;
  ayahCount: number;
  surahs: SurahSummary[];
}

/** One sura's text. */
export interface Surah {
  n: number;
  name: string;
  /**
   * The basmalah that opens the sura, or null where there is none: Al-Fatiha
   * carries it as its first ayah instead, and At-Tawba does not open with one.
   *
   * It is stored per sura rather than as a constant because Tanzil publishes it
   * in more than one form — the two suras that follow a sura ending in a sakin
   * b mark it with a shadda, since the recitation joins them.
   */
  bismillah: string | null;
  /** The ayat in order, so `ayahs[i]` is ayah `i + 1`. Verbatim. */
  ayahs: string[];
}

/**
 * Where a reader stopped (ADR-0056).
 *
 * One per reader, so it carries no identity of its own — that is also why it is
 * the one synced record whose key is derived rather than minted.
 */
export interface ReadingPosition {
  /** Tanzil's sura number. */
  surah: number;
  /** 1-based ayah number within that sura. */
  ayah: number;
  /** ISO instant; the last-write-wins key once this syncs (ADR-0029). */
  updatedAt: string;
}

/** One ayah a reader marked. Keyed by the client-minted id it keeps everywhere. */
export interface Bookmark {
  clientId: string;
  surah: number;
  ayah: number;
  createdAt: string;
  updatedAt: string;
  /**
   * Removing a Bookmark is a tombstone, never a delete (ADR-0033): the row has
   * to survive long enough to tell another device the mark is gone. Marking the
   * same ayah again clears it, so one ayah holds one row for good.
   */
  deletedAt: string | null;
}

/** Tanzil's 114 suras: the whole text, and the only Surah range a route accepts. */
export const QURAN_SURAH_COUNT = 114;

/**
 * Al-Baqarah's 286 Ayat: the longest sura, so the widest Ayah number any sura
 * can have — and the same bound the table's check enforces.
 */
export const QURAN_LONGEST_SURA_AYAH_COUNT = 286;

/**
 * What every owned write carries (ADR-0029): the id the device minted for it,
 * and the device's write time, which is what last-write-wins compares. The
 * server's clock stands in when the time is absent.
 */
const quranWriteMeta = {
  clientId: z.string().uuid(),
  updatedAt: z.string().datetime().optional(),
};

/** A write that moves the reader's place: one row per reader, keyed by that. */
export const QuranPositionWriteSchema = z.object({
  surah: z.number().int().min(1).max(QURAN_SURAH_COUNT),
  ayah: z.number().int().min(1).max(QURAN_LONGEST_SURA_AYAH_COUNT),
  ...quranWriteMeta,
});
export type QuranPositionWrite = z.infer<typeof QuranPositionWriteSchema>;

/**
 * Marking an Ayah and unmarking it are one write with two payloads, because the
 * table keeps one row per (surah, ayah) either way: `deletedAt: null` marks or
 * re-marks, and an instant tombstones it (ADR-0033, ADR-0056).
 */
export const QuranBookmarkWriteSchema = z.object({
  surah: z.number().int().min(1).max(QURAN_SURAH_COUNT),
  ayah: z.number().int().min(1).max(QURAN_LONGEST_SURA_AYAH_COUNT),
  deletedAt: z.string().datetime().nullable().optional(),
  ...quranWriteMeta,
});
export type QuranBookmarkWrite = z.infer<typeof QuranBookmarkWriteSchema>;

/**
 * The pull: every record the reader owns, plus the cursor for the next page.
 *
 * `bookmarks` includes tombstones, because a mark removed on another device is
 * exactly what this one has to replay. `position` is null when the reader has
 * not started here or anywhere else.
 */
export interface QuranSyncSnapshot {
  position: ReadingPosition | null;
  bookmarks: Bookmark[];
  /**
   * The newest `server_updated_at` in the page — the value to pass back as
   * `?since=`. It is the server's stamp rather than `updatedAt`, so a device
   * whose clock lags cannot make a row invisible to its own next pull.
   */
  cursor: string | null;
}
