import { z } from 'zod';

import { toLatinDigits } from '@/shared/contracts/text';

/** A title long enough for a sentence, short enough to list in one line. */
export const NOTE_TITLE_MAX = 200;

/** The body's ceiling: a very long note, still a bounded row. */
export const NOTE_BODY_MAX = 100_000;

/**
 * One note, as the device and the server both hold it.
 *
 * The record is camelCase on both sides because the device's copy is the source
 * of truth: `updatedAt` is the last-write-wins stamp (ADR-0029), `deletedAt` the
 * tombstone an undo clears, and the id is the client-minted UUIDv7 that keys the
 * row everywhere.
 *
 * `body` is Markdown, the same text format BlogPress posts use: it is portable,
 * diffable, and a plain-text projection of it (`markdownToPlainText`) is what the
 * list preview and search read. Nothing server-side ever renders it as HTML, so
 * storing the source is enough.
 */
export type Note = {
  id: string;
  clientId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** The owned dataset for reconciliation, tombstones included (ADR-0028). */
export interface NotesSyncSnapshot {
  notes: Note[];
  /** Opaque `server_updated_at` cursor for the next pull, or null before the first. */
  cursor: string | null;
}

/** Trim, cap and normalise a title on its way out of the editor. */
export function normalizeNoteTitle(value: string): string {
  return toLatinDigits(value).trim().slice(0, NOTE_TITLE_MAX);
}

/** A body is kept as written apart from digit normalisation and the hard cap. */
export function normalizeNoteBody(value: string): string {
  return toLatinDigits(value).slice(0, NOTE_BODY_MAX);
}

export const NoteWriteSchema = z.object({
  title: z.string().max(NOTE_TITLE_MAX).default(''),
  body: z.string().max(NOTE_BODY_MAX).default(''),
  createdAt: z.string().optional(),
  clientId: z.string().uuid().optional().nullable(),
  updatedAt: z.string().optional(),
});

/**
 * A patch: only the fields the caller supplies are written, and `deletedAt`
 * distinguishes a delete (`timestamp`), an undo/resurrect (`null`), and an edit
 * that leaves the tombstone alone (absent).
 */
export const NoteUpdateSchema = z
  .object({
    title: z.string().max(NOTE_TITLE_MAX).optional(),
    body: z.string().max(NOTE_BODY_MAX).optional(),
    clientId: z.string().uuid().optional().nullable(),
    updatedAt: z.string().optional(),
    deletedAt: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'لا يوجد تغيير لحفظه' });

export type NoteWriteInput = z.infer<typeof NoteWriteSchema>;
export type NoteUpdateInput = z.infer<typeof NoteUpdateSchema>;
