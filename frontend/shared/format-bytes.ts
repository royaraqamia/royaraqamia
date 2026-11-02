/**
 * A best-effort, human-readable size for a format option. Returns `null` when
 * the size is unknown (the provider could not estimate it), so the caller can
 * say so rather than print "0".
 */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined) return null;
  if (!Number.isFinite(bytes) || bytes <= 0) return null;

  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `≈ ${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} م.ب`;
  }
  const kb = bytes / 1024;
  return `≈ ${Math.max(1, Math.round(kb))} ك.ب`;
}

/**
 * A known size, for an attachment chip or a remaining allowance. The `≈` of
 * `formatBytes` belongs to an estimate; this one is the number we hold, and zero
 * is a real answer here ("no storage used").
 */
export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 ك.ب';

  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} م.ب`;
  return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
}
