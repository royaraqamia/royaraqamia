/**
 * The Outbox (ADR-0029): ordered, replayable intents that carry a write to the
 * server after the Local Store has already applied it locally.
 *
 * An entry is the durable record of "the user meant this"; it is removed only
 * once the server has accepted the replay, so a crash, a reload or a service
 * worker restart can never lose a write. Entries that fail permanently are kept
 * as `failed` (surfaced to the user), never dropped.
 */
export type OutboxStatus = 'pending' | 'failed';

export interface OutboxEntry<TPayload = unknown> {
  /**
   * Monotonic insertion key assigned by IndexedDB (`autoIncrement`). This is
   * the strict replay order: UUIDv7 is only time-ordered to the millisecond, so
   * writes made within the same tick would otherwise replay in random order.
   */
  seq: number;
  /** Client-minted UUIDv7, for traceability in logs and payloads. */
  id: string;
  /** Owned entity the intent targets, e.g. `habit` | `habit_log` | `backup`. */
  entity: string;
  /** Replay discriminator, e.g. `habit.create` | `log.toggle`. */
  type: string;
  /** Body handed to the transport when replaying. */
  payload: TPayload;
  createdAt: number;
  attempts: number;
  status: OutboxStatus;
  lastError: string | null;
  /** Epoch ms before which a retry must not run (exponential backoff). */
  nextAttemptAt: number;
}

/** An entry as authored by a writer; `seq` is assigned by the store on insert. */
export type NewOutboxEntry<TPayload = unknown> = Omit<OutboxEntry<TPayload>, 'seq'>;

export const OUTBOX_STORE = 'outbox';

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60 * 1_000;

/**
 * Exponential backoff with full jitter (ADR-0029): the cap keeps a long-offline
 * device from hammering the server on reconnect, the jitter keeps many devices
 * from retrying in lockstep.
 */
export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, attempts - 1);
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
  return Math.floor(random() * ceiling);
}

export function isDue(entry: OutboxEntry, now: number): boolean {
  return entry.status === 'pending' && entry.nextAttemptAt <= now;
}
