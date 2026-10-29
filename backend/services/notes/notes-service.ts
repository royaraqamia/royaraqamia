import type {
  NoteWrite,
  NoteWriteMeta,
  NotesRepository,
} from '@/backend/repositories/notes/notes-repository';
import type { Note, NotesSyncSnapshot } from '@/shared/contracts/notes';

/**
 * The server half of Notes' sync (ADR-0092).
 *
 * Thin on purpose: a note is a single-owner row identified by the id the device
 * minted, so there is no rule to enforce here — a pull since a cursor, an
 * idempotent upsert, a tombstone, and last-write-wins inside the repository. The
 * layer still exists because it is the seam per-product rules land in later, and
 * because the controller must not know how rows are stored.
 */
export class NotesService {
  constructor(private readonly repository: NotesRepository) {}

  async getSyncSnapshot(userId: string, since?: string | null): Promise<NotesSyncSnapshot> {
    return this.repository.getSyncSnapshot(userId, since);
  }

  /** The row an edit would replace, tombstone included (the cap check's input). */
  async getNote(userId: string, id: string): Promise<Note | null> {
    return this.repository.getNote(userId, id);
  }

  async saveNote(userId: string, id: string, note: NoteWrite, meta?: NoteWriteMeta): Promise<void> {
    return this.repository.saveNote(userId, id, note, meta);
  }

  async deleteNote(userId: string, id: string, meta?: NoteWriteMeta): Promise<void> {
    return this.repository.deleteNote(userId, id, meta);
  }
}
