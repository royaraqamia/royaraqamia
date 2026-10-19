import type {
  QuranBookmarkWrite,
  QuranSyncRepository,
  QuranWriteMeta,
} from '@/backend/repositories/quran/quran-sync-repository';
import type { QuranSyncSnapshot, ReadingPosition } from '@/shared/contracts/quran';

/**
 * The server half of the Quran's sync (ADR-0056, P1b).
 *
 * It is thin on purpose: a Reading position and a Bookmark are single-owner
 * rows whose identity is a natural key, so there is no rule to enforce here — a
 * pull since a cursor, two idempotent writes, and last-write-wins inside the
 * repository. The layer still exists because it is the seam per-product rules
 * land in later (a per-Surah Ayah bound, a quota), and because the controller
 * must not know how the rows are stored.
 */
export class QuranSyncService {
  constructor(private readonly repository: QuranSyncRepository) {}

  async getSyncSnapshot(userId: string, since?: string | null): Promise<QuranSyncSnapshot> {
    return this.repository.getSyncSnapshot(userId, since);
  }

  async saveReadingPosition(
    userId: string,
    position: Omit<ReadingPosition, 'updatedAt'>,
    meta?: QuranWriteMeta
  ): Promise<void> {
    return this.repository.saveReadingPosition(userId, position, meta);
  }

  async setBookmark(
    userId: string,
    bookmark: QuranBookmarkWrite,
    meta?: QuranWriteMeta
  ): Promise<void> {
    return this.repository.setBookmark(userId, bookmark, meta);
  }
}
