'use client';

/**
 * Sign-out is the one moment cache contents can belong to the previous account.
 * The service worker owns those entries and holds the LRU index for them, so the
 * page only asks it to purge and waits briefly for the acknowledgement.
 *
 * Best-effort by design: a browser without a controlling worker, or a worker
 * that never answers, must not delay or fail a sign-out. IndexedDB (the Local
 * Store and Outbox) is deliberately out of scope — the durable per-identity copy
 * survives sign-out by design (ADR-0028).
 */

const PURGE_TIMEOUT_MS = 2000;

interface CacheMaintenanceWorker {
  postMessage(message: unknown, transfer: Transferable[]): void;
}

interface CacheMaintenanceContainer {
  controller: CacheMaintenanceWorker | null;
  ready: Promise<{ active: CacheMaintenanceWorker | null }>;
}

function browserContainer(): CacheMaintenanceContainer | undefined {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker;
}

export async function purgeServiceWorkerCaches(
  container: CacheMaintenanceContainer | undefined = browserContainer(),
  timeoutMs = PURGE_TIMEOUT_MS
): Promise<boolean> {
  if (!container) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let channel: MessageChannel | null = null;

    const finish = (purged: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel?.port1.close();
      resolve(purged);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    const worker =
      container.controller ??
      container.ready.then((registration) => registration.active).catch(() => null);

    Promise.resolve(worker)
      .then((active) => {
        if (settled) return;
        if (!active) {
          finish(false);
          return;
        }
        channel = new MessageChannel();
        channel.port1.onmessage = () => finish(true);
        try {
          active.postMessage({ type: 'PURGE_ACCOUNT_CACHES' }, [channel.port2]);
        } catch {
          finish(false);
        }
      })
      .catch(() => finish(false));
  });
}
