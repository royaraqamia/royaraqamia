import { z } from 'zod';
import {
  APP_PERF_LAUNCH_MAX_MS,
  APP_PERF_PLATFORMS,
  APP_PERF_TAP_MAX_MS,
  type AppPerfPlatform,
} from '@/shared/contracts/app-perf-limits';

export type { AppPerfPlatform };

export const AppPerfPlatformSchema = z.enum(APP_PERF_PLATFORMS);

/**
 * The launch and tap beacon (#487) — the field measurement the instant-feel
 * program is judged against. It carries three durations and nothing that could
 * name a person, a page or a session:
 *
 * - `shellMs`: `boot` → `shell`, the chrome committed.
 * - `contentMs`: `boot` → `content`, owned rows painted from the Local Store.
 * - `cold`: whether the document came over the network (cold) or from a cache
 *   (warm). The decision gate in #486 splits its budget on exactly this axis.
 *
 * Both durations are measured from `performance.timeOrigin`, so "cold open →
 * content" includes the document request, not just the hydration.
 */
export const AppPerfLaunchReportSchema = z.object({
  version: z.literal(1),
  kind: z.literal('launch'),
  platform: AppPerfPlatformSchema,
  cold: z.boolean(),
  shellMs: z.number().int().nonnegative().max(APP_PERF_LAUNCH_MAX_MS),
  contentMs: z.number().int().nonnegative().max(APP_PERF_LAUNCH_MAX_MS),
});

export type AppPerfLaunchReport = z.infer<typeof AppPerfLaunchReportSchema>;

/**
 * One local mutation's tap → paint. There is no mutation name, no page and no
 * product: a per-mutation breakdown is exactly the browsing record this
 * endpoint is built not to keep.
 */
export const AppPerfTapReportSchema = z.object({
  version: z.literal(1),
  kind: z.literal('tap'),
  platform: AppPerfPlatformSchema,
  paintMs: z.number().int().nonnegative().max(APP_PERF_TAP_MAX_MS),
});

export type AppPerfTapReport = z.infer<typeof AppPerfTapReportSchema>;

export const AppPerfReportSchema = z.discriminatedUnion('kind', [
  AppPerfLaunchReportSchema,
  AppPerfTapReportSchema,
]);

export type AppPerfReport = z.infer<typeof AppPerfReportSchema>;
