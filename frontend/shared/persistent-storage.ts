/**
 * Requests durable ("persistent") storage for the origin so the browser does not
 * evict the Local Store / Outbox under pressure. Best-effort and safe to call
 * repeatedly: browsers may grant or silently ignore it (Safari, older Firefox),
 * and a denial is never an error — it only means the data is evictable.
 *
 * Call after a real save or an install gesture; browsers weigh those signals.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;

  const storage = navigator.storage;
  if (!storage || typeof storage.persist !== 'function') return false;

  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) {
      return true;
    }
    return await storage.persist();
  } catch {
    return false;
  }
}

/** Whether this page session has already asked; a second ask buys nothing. */
let requestedOnce = false;

/**
 * Asks at most once per page session. Called from the write path, because a
 * committed write is the "real save" gesture browsers weigh — asking on every
 * write would only repeat a question the browser has already answered.
 */
export function requestPersistentStorageOnce(): void {
  if (requestedOnce) return;
  requestedOnce = true;
  void requestPersistentStorage();
}
