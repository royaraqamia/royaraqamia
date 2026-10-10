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
