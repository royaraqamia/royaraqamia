import type { ScreenScope } from '@/frontend/state/screen-scopes';

/**
 * What `/scan` registers while the scanner is on screen (ADR-0181, #1420).
 *
 * The page registers itself and nothing else. A decoded code is deliberately not
 * published: a scanner reads whatever the camera is pointed at, and the
 * certificate a visitor scans may be another member's row — the one thing this
 * contract cannot carry (decision 8's reason, applied to a surface that has no
 * owner). The camera's own state is on the page, not in the snapshot.
 */
export function scanScreenScope(): ScreenScope {
  return { id: 'scan.page', kind: 'screen' };
}
