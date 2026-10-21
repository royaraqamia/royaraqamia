import type { SyncEngine } from '@/frontend/shared/local-store/sync-engine';
import { requestDeviceWake } from '@/frontend/shared/local-store/device-wake';

/**
 * The page half of web Background Sync (ADR-0058).
 *
 * The Outbox is durable, so a write off the network is never lost — but with the
 * tab closed, nothing on the page can replay it. Registering a Background Sync
 * tag hands that job to the browser: it fires a `sync` event in the service
 * worker when connectivity returns, and the worker drains the queue
 * (`frontend/api/sw-outbox.ts`). Safari and Firefox have no `SyncManager`, so
 * there the in-page triggers remain the whole story — a limit the pending count
 * has to say plainly, not a feature we gate on.
 */

/** The tag the page registers and the worker answers. */
export const OUTBOX_SYNC_TAG = 'outbox-flush';

/**
 * How long to wait for a registration that does not exist yet.
 * `getRegistration()` returns nothing in the moment before `PWAProvider`'s
 * register() lands, and `ready` never resolves when nothing ever registers — so
 * the wait is bounded rather than a promise a page could hold open for its life.
 */
const REGISTRATION_WAIT_MS = 4_000;

type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

async function registrationFor(
  container: ServiceWorkerContainer
): Promise<ServiceWorkerRegistration | null> {
  const existing = await container.getRegistration().catch(() => undefined);
  if (existing) return existing;

  return Promise.race([
    container.ready,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), REGISTRATION_WAIT_MS);
    }),
  ]);
}

/**
 * Asks the browser to wake the worker for a flush the page could not finish.
 * Returns whether a tag was actually registered — `false` means this browser
 * cannot do it, which is information a caller may want to surface.
 */
export async function requestOutboxFlush(
  container: ServiceWorkerContainer | undefined = globalThis.navigator?.serviceWorker
): Promise<boolean> {
  if (!container) return false;

  const registration = await registrationFor(container);
  const sync = registration ? (registration as SyncCapableRegistration).sync : undefined;
  if (!sync) return false;

  try {
    await sync.register(OUTBOX_SYNC_TAG);
    return true;
  } catch {
    // Registration can be refused (a permission policy, a worker mid-update).
    // The in-page triggers are still in place, so this is not a dropped write.
    return false;
  }
}

/**
 * The native tier: the same condition, a different waker (ADR-0059).
 *
 * Background Sync is the browser's promise to come back with no tab open, and an
 * Android WebView cannot keep it: there is no browser process to keep, so a
 * closed shell has nothing that fires. The shell therefore wakes itself —
 * `RoyShellSync.schedule()` asks the app to enqueue its WorkManager drain, which
 * loads the same drain in a headless WebView (`public/sync-flush.html`).
 *
 * This is a *signal*, never a second writer: it tells the shell that work exists,
 * and the shell runs the one implementation of the queue. Called after our own
 * flush has already left something behind, so the condition is identical to the
 * one that registers the Background Sync tag — whichever tier the platform
 * supports, the wakers are the same decision.
 *
 * Returns whether a shell was there to take the signal; a plain browser is not a
 * failure, it is the tier above being the whole story.
 */
export function requestShellFlush(): boolean {
  const shell = (globalThis as { RoyShellSync?: { schedule?: () => void } }).RoyShellSync;
  if (typeof shell?.schedule !== 'function') return false;

  try {
    shell.schedule();
    return true;
  } catch {
    // A bridge that throws is a shell that cannot be asked; the Inbox stays
    // durable either way, and the next open flushes it.
    return false;
  }
}

/**
 * Reads the shell's record of its last background drain back (#455).
 *
 * `SyncFlushWorker` persists a small record every time the drain page actually
 * reports — when it was, what it delivered and pulled, what it left, the error —
 * and `MainActivity`'s bridge answers `lastFlush()` with it, so `/device` can
 * name work the shell did while nobody was looking. Returns null without a shell,
 * without a record, or with an unreadable one: no answer is no section, never a
 * guess. Absent in every browser by definition, which is the page's own signal
 * to stay quiet about this tier.
 */
export interface ShellLastFlush {
  /** Epoch milliseconds of the moment the report landed. */
  at: number;
  /** Intents the server accepted during the drain. */
  delivered: number;
  /** Intents still queued when the drain ended. */
  left: number;
  /** Rows the pull read back from the server (ADR-0060). */
  pulled: number;
  /** Why the drain could not run, when it could not. */
  error: string | null;
}

function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function readShellLastFlush(
  shell: { RoyShellSync?: { lastFlush?: () => string | null } } = globalThis as never
): ShellLastFlush | null {
  const bridge = shell.RoyShellSync;
  if (typeof bridge?.lastFlush !== 'function') return null;

  try {
    const raw = bridge.lastFlush();
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    const at = readCount(record.at);
    const delivered = readCount(record.delivered);
    const left = readCount(record.left);
    if (at === null || delivered === null || left === null) return null;

    return {
      at,
      delivered,
      left,
      pulled: readCount(record.pulled) ?? 0,
      error: typeof record.error === 'string' ? record.error : null,
    };
  } catch {
    return null;
  }
}

/**
 * Flushes the Outbox and, if the queue is still not empty, asks the browser to
 * wake the worker later — and the shell, where there is a shell.
 *
 * The condition is the point. Registering on every write would wake the worker
 * for work the page had already delivered; never registering leaves a closed tab
 * with a queue nothing will flush. What is left after our own attempt is exactly
 * the set the other tiers have to come back for — a write made offline, or one
 * the server refused.
 */
export function flushOutbox(engine: SyncEngine | null | undefined): void {
  if (!engine) return;
  void flushThenRequestWake(engine);
}

/** Asks every tier that exists for another attempt. */
async function requestWake(): Promise<void> {
  await requestOutboxFlush();
  requestShellFlush();
}

async function flushThenRequestWake(engine: SyncEngine): Promise<void> {
  let delivered = 0;
  try {
    const before = await engine.status();
    await engine.flush();
    const after = await engine.status();
    delivered = Math.max(0, before.pending - after.pending);
    if (after.pending > 0) await requestWake();
  } catch {
    // A flush can throw when a store is torn down mid-replay. The Outbox is
    // still the record of what is owed, so the wake request is still worth it.
    await requestWake();
  }

  // A delivered write is the one moment this device knows the account moved, so
  // it is also the moment to tell the *other* devices (ADR-0060): they cannot
  // read a Realtime hint if they are not open, and a closed shell has no other
  // way to learn. A pull deliberately does not do this — only a commit does,
  // which is what stops two devices waking each other in a loop.
  if (delivered > 0) requestDeviceWake();
}
