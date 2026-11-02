import type { AppFailureKind, AppFailureReport } from '@/shared/contracts/app-failures';

/**
 * Where a failure report goes: one `captureMessage` per report, with the tags
 * and fingerprint that make it one issue per class rather than one per phone.
 *
 * The port exists so the service can be tested without Sentry, and so the sink
 * stays a wiring decision (`backend/config/observability.ts`) instead of an
 * import inside the rule.
 */
export interface AppFailureSource {
  capture(message: string, context: AppFailureContext): void;
}

export interface AppFailureContext {
  level: 'error' | 'warning';
  fingerprint: string[];
  tags: Record<string, string>;
  extra: Record<string, unknown>;
}

/** Frames that name a credential never leave the server, whatever the client sent. */
const REJECTED_FRAME =
  /(authorization|bearer|access[_-]?token|refresh[_-]?token|apikey|api[_-]?key|secret|password|cookie|session)/i;

/**
 * A crash, an ANR or a failed drain, as one grouped issue (#667).
 *
 * The rules are the contract's, restated where a person reads them:
 *
 * - **One issue per class, not one per report.** The fingerprint is
 *   `['app-failure', kind, reason]`, so the fifth launch loop of the same crash
 *   is the same issue counted five times instead of five issues to triage.
 * - **The tags are the release**, so a report can be attributed to an APK and to
 *   the contracts that APK carries, without opening it.
 * - **The frames are the only free-ish field**, and they are structurally
 *   unable to carry a message or a query string (the schema's pattern). This
 *   filter is the second gate: a frame naming a credential is dropped here even
 *   if a future schema widened.
 * - **A drain is a warning, not an error.** Nothing is lost — the write stays
 *   queued — so it must be visible without paging someone at 3 a.m.
 */
export class AppFailureService {
  constructor(private readonly deps: { failures: AppFailureSource }) {}

  record(report: AppFailureReport): void {
    const kind: AppFailureKind = report.kind;
    const frames = report.frames?.filter((frame) => !REJECTED_FRAME.test(frame));

    this.deps.failures.capture(`[app-failure] ${kind}/${report.reason}`, {
      level: kind === 'drain' ? 'warning' : 'error',
      fingerprint: ['app-failure', kind, report.reason],
      tags: {
        'app.kind': kind,
        'app.reason': report.reason,
        'app.shell': report.shell.name,
        'app.shell.code': String(report.shell.code),
        'app.contracts': report.contracts,
      },
      extra: {
        signature: report.signature ?? null,
        frames: frames && frames.length > 0 ? frames : null,
        pending: report.pending ?? null,
        failed: report.failed ?? null,
        at: report.at ?? null,
      },
    });
  }
}
