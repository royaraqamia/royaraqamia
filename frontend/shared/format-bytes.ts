/**
 * A best-effort, human-readable size for a format option. Returns `null` when
 * the size is unknown (the provider could not estimate it), so the caller can
 * say so rather than print "0".
 */

/**
 * The known size and the refused upload print their numbers the same way
 * (#1805). The shared module owns the arithmetic; this file keeps the name the
 * site's callers already import.
 */
export { byteSizeParts, formatAttachmentSize } from '@/shared/format-attachment-size';
export type { ByteSizeParts } from '@/shared/format-attachment-size';

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
