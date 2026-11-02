import { z } from 'zod';

/**
 * The app's own failure report (#667): a crash, an ANR, or a drain that ended
 * owing work, sent by the installed APK to the site.
 *
 * The web has a browser console, a Sentry SDK and a page a person can open; a
 * native client has none of them, so a failure that is only a `Log.w` on a
 * phone nobody is watching is a failure nobody hears. This is the contract that
 * carries it, and it is deliberately narrow — the entire record is:
 *
 * - what kind of failure it was, and a reason **class** inside that kind;
 * - the release it came from: `shell.name`/`shell.code`, and the contract
 *   generation the APK was compiled against, so a report is attributable to an
 *   APK rather than to "the app";
 * - for an uncaught Java crash, the exception's own name and its frames — never
 *   its message, because a message is written by whatever threw and can hold
 *   anything (a URL, a body, a token);
 * - for a drain, two counts and nothing else: how many writes are still owed
 *   and how many were refused. No row contents, no endpoint, no query string.
 *
 * What is deliberately absent is as much of the design as what is present: no
 * user id, no session, no token, no free text, no device id and no URL. The page
 * that says where these land also says what is not collected
 * (`docs/mobile/crash-reports.md`).
 */

/** The three things the app can report: a crash, an ANR, a drain that failed. */
export const APP_FAILURE_KINDS = ['crash', 'anr', 'drain'] as const;
export type AppFailureKind = (typeof APP_FAILURE_KINDS)[number];

/**
 * The reason class, closed on purpose. A new class is a schema change, not a
 * string a client can invent: `crash` is `uncaught` (the process's own handler)
 * or `native` (the exit history saw a native death); `anr` is `anr`; a drain is
 * `no-session`, `unreachable` (attempts owed and the network answered badly),
 * `refused` (the server said no) or `abandoned` (the attempt budget ran out).
 */
export const APP_FAILURE_REASONS = [
  'uncaught',
  'native',
  'anr',
  'no-session',
  'unreachable',
  'refused',
  'abandoned',
] as const;
export type AppFailureReason = (typeof APP_FAILURE_REASONS)[number];

/** Which reasons belong to which kind; a report that mixes them is refused. */
export const APP_FAILURE_REASONS_BY_KIND: Record<AppFailureKind, readonly AppFailureReason[]> = {
  crash: ['uncaught', 'native'],
  anr: ['anr'],
  drain: ['no-session', 'unreachable', 'refused', 'abandoned'],
};

/**
 * A release name, as `android/shell-version.properties` spells it: `1.0.21`.
 * Digits only, because the version code beside it is what an update compares.
 */
export const AppFailureShellSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(24)
    .regex(/^\d+\.\d+\.\d+$/),
  code: z.number().int().nonnegative().max(9_999_999),
});

/**
 * The exception's class name (`java.lang.IllegalStateException`) or a class of
 * this contract's own (`anr`, `drain`). The pattern is the point: no spaces, no
 * colons and no braces, so a message cannot be smuggled in through the field a
 * grouping rule reads.
 */
export const APP_FAILURE_SIGNATURE_MAX = 80;
const SIGNATURE = /^[A-Za-z_$][A-Za-z0-9._$<>[\]]*$/;
export const APP_FAILURE_SIGNATURE = SIGNATURE;

/**
 * One stack frame, formatted by the app as `class.method(file.kt:123)`.
 *
 * The allowed characters are the format's, not a message's: letters, digits and
 * `. _ $ < > [ ] ( ) : / -`. A `?` is not among them, which is what makes a URL
 * with a query string unable to travel as a frame, and neither is a space, which
 * keeps a sentence out.
 */
export const APP_FAILURE_FRAME_MAX = 160;
const FRAME = /^[A-Za-z0-9._$<>[\]():/-]*$/;
export const APP_FAILURE_FRAME = FRAME;

/** How many frames a crash report may carry. The top of the stack is the point. */
export const APP_FAILURE_MAX_FRAMES = 16;

/** The largest count a drain report may claim; anything above is a bug, not a queue. */
export const APP_FAILURE_MAX_COUNT = 100_000;

/**
 * The body. `version` is the beacon convention (a shape change is a new
 * literal), and every optional field is optional because its kind does not carry
 * it: an ANR has no frames, a crash has no counts.
 */
export const AppFailureReportSchema = z.object({
  version: z.literal(1),
  kind: z.enum(APP_FAILURE_KINDS),
  reason: z.enum(APP_FAILURE_REASONS),
  signature: z.string().max(APP_FAILURE_SIGNATURE_MAX).regex(SIGNATURE).optional(),
  shell: AppFailureShellSchema,
  /** Twelve hex characters: a hash of the generated contracts this APK carries. */
  contracts: z.string().regex(/^[0-9a-f]{12}$/),
  frames: z
    .array(z.string().max(APP_FAILURE_FRAME_MAX).regex(FRAME))
    .max(APP_FAILURE_MAX_FRAMES)
    .optional(),
  /** Writes still owed when the drain gave up. A count, never a row. */
  pending: z.number().int().nonnegative().max(APP_FAILURE_MAX_COUNT).optional(),
  /** Writes the server refused. */
  failed: z.number().int().nonnegative().max(APP_FAILURE_MAX_COUNT).optional(),
  /** When the device says it happened, in epoch milliseconds. Advisory only. */
  at: z.number().int().nonnegative().optional(),
});

export type AppFailureReport = z.infer<typeof AppFailureReportSchema>;

/**
 * The rules the shape cannot state: which reasons a kind may carry, and which
 * fields a kind may fill. The generator emits the plain object above — JSON
 * Schema has no cross-field rule — and the server validates with this.
 */
export const AppFailureReportRequestSchema = AppFailureReportSchema.superRefine((report, ctx) => {
  if (!APP_FAILURE_REASONS_BY_KIND[report.kind].includes(report.reason)) {
    ctx.addIssue({
      code: 'custom',
      path: ['reason'],
      message: `reason ${report.reason} does not belong to ${report.kind}`,
    });
  }

  if (report.frames !== undefined && report.reason !== 'uncaught') {
    ctx.addIssue({
      code: 'custom',
      path: ['frames'],
      message: 'only an uncaught Java crash carries frames',
    });
  }

  const counts = report.pending !== undefined || report.failed !== undefined;
  if (counts && report.kind !== 'drain') {
    ctx.addIssue({ code: 'custom', path: ['pending'], message: 'only a drain carries counts' });
  }

  if (report.kind === 'drain' && report.pending === undefined && report.failed === undefined) {
    ctx.addIssue({ code: 'custom', path: ['pending'], message: 'a drain names what it owes' });
  }
});
