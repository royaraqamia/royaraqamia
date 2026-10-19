import type { SyncEngine } from '@/frontend/shared/local-store/sync-engine';

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
  try {
    await engine.flush();
    if ((await engine.status()).pending > 0) await requestWake();
  } catch {
    // A flush can throw when a store is torn down mid-replay. The Outbox is
    // still the record of what is owed, so the wake request is still worth it.
    await requestWake();
  }
}
