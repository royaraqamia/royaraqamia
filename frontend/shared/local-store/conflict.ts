/**
 * Who wins when a pull meets the local copy (ADR-0029, and `shared/fixtures/
 * offline-writes/habitflow.json`'s `conflict` cases).
 *
 * Last write wins on `updatedAt`, and ties go to the device: the server has to be
 * *strictly* newer to replace a row, so a pull that arrives with the same
 * timestamp cannot undo an edit made in the same millisecond. A row whose write
 * is still queued is not a conflict at all — the device's copy is what the user
 * is looking at, and the server is about to be told about it.
 *
 * The rule lives here rather than inside `local-store.ts` because the app's
 * `HabitflowRepository.pull` has to answer it identically, and a rule only one
 * client states is the drift `docs/mobile/two-clients.md` exists for.
 */
export type ConflictWinner = 'local' | 'server';

export interface ConflictInput {
  /** The row on this device, or `null` when the device has never seen it. */
  local: { updatedAt?: string | null } | null;
  /** The row the server sent. */
  server: { updatedAt?: string | null };
  /** Whether an unflushed intent still owns this row. */
  pending: boolean;
}

export function conflictWinner({ local, server, pending }: ConflictInput): ConflictWinner {
  if (pending) return 'local';
  if (!local) return 'server';
  if (!local.updatedAt) return 'server';
  if (!server.updatedAt) return 'local';
  return server.updatedAt > local.updatedAt ? 'server' : 'local';
}
