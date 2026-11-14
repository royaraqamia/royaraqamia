import { z } from 'zod';

import { toLatinDigits } from '@/shared/contracts/text';

/** The body's ceiling: a very long note, still a bounded row. */
export const NOTE_BODY_MAX = 100_000;

/**
 * One note, as the device and the server both hold it.
 *
 * A note is its body — there is no title field, and the first line of the body
 * is the name the list shows (ADR-0110). One field is all a phone composer can
 * give the keyboard, and it is the field the writer is actually filling.
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

/** A body is kept as written apart from digit normalisation and the hard cap. */
export function normalizeNoteBody(value: string): string {
  return toLatinDigits(value).slice(0, NOTE_BODY_MAX);
}

export const NoteWriteSchema = z.object({
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
    body: z.string().max(NOTE_BODY_MAX).optional(),
    clientId: z.string().uuid().optional().nullable(),
    updatedAt: z.string().optional(),
    deletedAt: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'لا يوجد تغيير لحفظه' });

/**
 * A delete, which carries nothing but the write time its replay was queued
 * with: the server compares it with the stored stamp so a delete older than
 * the note it names is dropped instead of applied (ADR-0029). The body is
 * optional, because a client that never queued one deletes with no time at all.
 */
export const NoteDeleteSchema = z.object({
  updatedAt: z.string().optional(),
});

/**
 * One note as `GET /notes/api/sync` sends it (#1390), read by the app's store.
 *
 * The read model above is a TypeScript interface, which the Kotlin generator
 * cannot see: a body the site accepts and the app cannot decode is a blank
 * screen, so the shape the app reads is a schema. It carries the Outbox fields
 * because the route is tombstone-inclusive (ADR-0029) — a row deleted on another
 * device arrives as a tombstone, not as an absence.
 */
export const NoteSyncRowSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** The pull's answer: the owned notes and the cursor the device holds next. */
export const NotesSyncResponseSchema = z.object({
  notes: z.array(NoteSyncRowSchema),
  cursor: z.string().nullable(),
});

export type NoteSyncRow = z.infer<typeof NoteSyncRowSchema>;
export type NotesSyncResponse = z.infer<typeof NotesSyncResponseSchema>;

export type NoteWriteInput = z.infer<typeof NoteWriteSchema>;
export type NoteUpdateInput = z.infer<typeof NoteUpdateSchema>;
export type NoteDeleteInput = z.infer<typeof NoteDeleteSchema>;
