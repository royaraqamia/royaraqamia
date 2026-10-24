/**
 * The parts of the app-perf contract the client can use without the schema.
 *
 * `perf-marks.ts` rides the client entry (`instrumentation-client.ts`), so a
 * static import of `app-perf.ts` would pull Zod into every route's first load.
 * The platform names and the duration ceilings live here instead, and the
 * schema imports them back, so the two cannot drift.
 */

/** Where the app was running when the launch or the tap was measured. */
export const APP_PERF_PLATFORMS = ['web', 'pwa', 'shell'] as const;

export type AppPerfPlatform = (typeof APP_PERF_PLATFORMS)[number];

/**
 * The longest launch this program will accept. Ten minutes is already far past
 * the point where the number means anything (the decision gate in #486 asks for
 * a cold open in under a second); the ceiling exists to keep a resumed tab from
 * writing a nonsense sample into the log.
 */
export const APP_PERF_LAUNCH_MAX_MS = 600_000;

/** The longest tap-to-paint accepted. A backgrounded app can pause a tap for minutes. */
export const APP_PERF_TAP_MAX_MS = 60_000;

/**
 * The three marks the instant-feel program measures (#487), on the User Timing
 * timeline so a profiler trace and a Vercel log line describe the same launch.
 *
 * They live in the contract rather than in `perf-marks.ts` because the paint gate
 * (`e2e/perf-paint.spec.ts`, #558) reads them out of the browser: one definition
 * means the gate cannot measure a name the client never writes.
 */
export const APP_PERF_MARK = {
  /** `instrumentation-client.ts`, before hydration. */
  boot: 'roya:boot',
  /** The app chrome's first committed frame. */
  shell: 'roya:shell',
  /** Owned rows painted from the Local Store. */
  content: 'roya:content',
} as const;

/**
 * The measures those marks produce. `shell` and `content` stay on the timeline
 * for the whole launch; `tap` is cleared before the next tap is measured, so a
 * session keeps exactly one of each and a trace shows the last interaction.
 */
export const APP_PERF_MEASURE = {
  shell: 'roya:boot-to-shell',
  content: 'roya:boot-to-content',
  tap: 'roya:tap-to-paint',
} as const;
