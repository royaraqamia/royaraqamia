/**
 * Whether this connection can afford the returning reader's warm-up (ADR-0230).
 *
 * A browser that has opened نور once fetches the panel's chunk while the page
 * is idle, so the next tap opens a conversation that is already parsed
 * (ADR-0150). That chunk carries the composer and the editor — about 200 KB
 * gzip — and it lands on every screen, on every visit. A fair trade on a
 * broadband link, a bad one for a member who told the browser their connection
 * is metered: `saveData` is that statement, and `2g`/`slow-2g` are the estimate
 * a browser without it still gives.
 *
 * Nothing is taken away. A tap still fetches the panel; it just no longer
 * arrives before the member asks for it.
 */
export type ConnectionBudget = {
  saveData?: boolean | null;
  effectiveType?: string | null;
};

const EXPENSIVE_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

/** The pure seam, so the gate is tested without a browser's network stack. */
export function connectionAffordsWarmUp(connection: ConnectionBudget | null | undefined): boolean {
  if (!connection) return true;
  if (connection.saveData === true) return false;
  return !EXPENSIVE_EFFECTIVE_TYPES.has(connection.effectiveType ?? '');
}

/** The browser's own answer; a browser that reports no connection is not gated. */
export function warmUpIsAffordable(): boolean {
  const connection = (navigator as Navigator & { connection?: ConnectionBudget | null }).connection;
  return connectionAffordsWarmUp(connection);
}
