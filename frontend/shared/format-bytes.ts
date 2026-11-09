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
 * The number half of a known size, before a surface puts it into words
 * (ADR-0104): whole kilobytes below a megabyte, one decimal of a megabyte under
 * ten, and whole megabytes above. The unit is an enum rather than a word so each
 * client substitutes it from its own generated copy.
 */
export interface ByteSizeParts {
  readonly unit: 'kb' | 'mb';
  readonly value: string;
}

export function byteSizeParts(bytes: number): ByteSizeParts {
  const known = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const mb = known / (1024 * 1024);
  if (mb >= 1) {
    return { unit: 'mb', value: mb >= 10 ? Math.round(mb).toString() : mb.toFixed(1) };
  }
  const kb = Math.round(known / 1024);
  // A byte we hold is never "0 ك.ب" — only an empty store is.
  return { unit: 'kb', value: (known > 0 && kb === 0 ? 1 : kb).toString() };
}

/**
 * A known size, for an attachment chip or a remaining allowance. The `≈` of
 * `formatBytes` belongs to an estimate; this one is the number we hold, and zero
 * is a real answer here ("no storage used").
 */
export function formatAttachmentSize(bytes: number): string {
  const parts = byteSizeParts(bytes);
  return parts.unit === 'mb' ? `${parts.value} م.ب` : `${parts.value} ك.ب`;
}
