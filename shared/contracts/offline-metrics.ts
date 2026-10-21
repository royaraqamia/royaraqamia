import { z } from 'zod';

/**
 * The doors `/offline` can be reached through (ADR-0074, #474). Each name says
 * which accepted path missed, so a field count separates the doors the roadmap
 * expects — a first install, an online-only route, a route never visited before
 * — from a real regression.
 *
 * - `navigation-deadline`: an ordinary navigation whose network answer missed
 *   the 10s deadline (#447).
 * - `navigation-offline`: an ordinary navigation with no cached copy and no
 *   network answer.
 * - `online-only-deadline`: a never-cache navigation (`/admin`, `/mcp/connect`)
 *   past the deadline.
 * - `online-only-offline`: a never-cache navigation with no network.
 * - `static-offline`: a static-asset navigation whose fetch failed.
 * - `api-offline`: an API-read navigation whose fetch failed.
 * - `no-fallback`: the offline page itself was not in Cache Storage — the
 *   first-install shape, and the one that says the shell is missing.
 */
export const OfflineServeDoorSchema = z.enum([
  'navigation-deadline',
  'navigation-offline',
  'online-only-deadline',
  'online-only-offline',
  'static-offline',
  'api-offline',
  'no-fallback',
]);

export type OfflineServeDoor = z.infer<typeof OfflineServeDoorSchema>;

/**
 * Cache outcomes tallied in the worker since the previous report, riding along
 * with an `/offline` serve. `hits` were answered from Cache Storage, `misses`
 * found no entry at request time, `failures` are a failed or deadline-cut fetch.
 * Counts only — no response times, no sizes, no URLs.
 */
export const OfflineCacheOutcomesSchema = z.object({
  hits: z.number().int().nonnegative().max(1_000_000),
  misses: z.number().int().nonnegative().max(1_000_000),
  failures: z.number().int().nonnegative().max(1_000_000),
});

export type OfflineCacheOutcomes = z.infer<typeof OfflineCacheOutcomesSchema>;

/** One beacon per `/offline` serve. `version` lets a later change add a field. */
export const OfflineServeReportSchema = z.object({
  version: z.literal(1),
  door: OfflineServeDoorSchema,
  cache: OfflineCacheOutcomesSchema,
});

export type OfflineServeReport = z.infer<typeof OfflineServeReportSchema>;
