import {
  APP_PERF_LAUNCH_MAX_MS,
  APP_PERF_TAP_MAX_MS,
  type AppPerfPlatform,
} from '@/shared/contracts/app-perf-limits';
import type { AppPerfReport } from '@/shared/contracts/app-perf';
import { SHELL_USER_AGENT_TOKEN } from '@/frontend/shared/shell-update';

/**
 * The three marks the instant-feel program measures (#487), on the User Timing
 * timeline so a profiler trace and a Vercel log line describe the same launch.
 */
export const APP_PERF_MARK = {
  /** `instrumentation-client.ts`, before hydration. */
  boot: 'roya:boot',
  /** The app chrome's first committed frame. */
  shell: 'roya:shell',
  /** Owned rows painted from the Local Store. */
  content: 'roya:content',
} as const;

const REPORT_PATH = '/api/app-perf';
const TAP_MARK_PREFIX = 'roya:tap';
const PAINT_MARK_PREFIX = 'roya:paint';

/** The slice of the User Timing API this module needs, so a test can hand in a stub. */
export interface PerformanceLike {
  mark(name: string): unknown;
  measure(name: string, start?: string, end?: string): { duration: number };
  clearMarks(name?: string): void;
  clearMeasures(name?: string): void;
}

export interface AppPerfMarksDeps {
  perf?: PerformanceLike;
  fetchImpl?: typeof fetch;
  platform?: AppPerfPlatform;
  cold?: boolean;
  isOnline?: () => boolean;
  /** Runs once the browser has painted (two frames); injected by tests. */
  afterPaint?: (run: () => void) => void;
  /** Runs off the paint path; injected by tests. */
  defer?: (run: () => void) => void;
  /** Receives the record instead of the default beacon; injected by tests. */
  send?: (report: AppPerfReport) => void;
}

export interface AppPerfMarks {
  markBoot(): void;
  markShell(): void;
  markContent(): void;
  /** Marks the tap now; call the returned function once the mutation has updated the UI. */
  beginTap(): () => void;
}

/**
 * The launch and tap marks (#487). One `launch` record is sent per launch, when
 * the first content surface paints owned rows, and one `tap` record per local
 * mutation. The beacon is deferred off the paint path, uses `keepalive`, is
 * skipped while offline, and is never retried — the same guarantees as the
 * `/offline` beacon (ADR-0074), and no URL, user, session or client id in the
 * payload.
 *
 * Durations come from `performance.timeOrigin` (mark `boot` is `0` for all
 * practical purposes), so they include the document request that a cold open
 * pays and a warm one does not.
 *
 * The decision, the cold/warm rule and the boundary are ADR-0075.
 */
export function createAppPerfMarks(deps: AppPerfMarksDeps = {}): AppPerfMarks {
  const perf = deps.perf ?? globalThis.performance;
  const afterPaint = deps.afterPaint ?? defaultAfterPaint;
  const platform = () => deps.platform ?? detectAppPerfPlatform();
  const cold = () => deps.cold ?? detectColdLaunch();

  let booted = false;
  let shellMarked = false;
  let launchReported = false;
  let taps = 0;

  function mark(name: string): void {
    try {
      perf.mark(name);
    } catch {
      // A WebView without User Timing is not worth breaking a paint over.
    }
  }

  function measure(name: string, start: string, end: string): number | null {
    try {
      return Math.round(perf.measure(name, start, end).duration);
    } catch {
      return null;
    }
  }

  function remember(report: AppPerfReport): void {
    if (deps.send) {
      deps.send(report);
      return;
    }
    const online = deps.isOnline ?? defaultIsOnline;
    if (!online()) return;
    const fetchImpl = deps.fetchImpl ?? defaultFetch;
    (deps.defer ?? defaultDefer)(() => {
      void fetchImpl(REPORT_PATH, {
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      }).catch(() => undefined);
    });
  }

  function markBoot(): void {
    if (booted) return;
    booted = true;
    mark(APP_PERF_MARK.boot);
  }

  function markShell(): void {
    if (shellMarked) return;
    shellMarked = true;
    mark(APP_PERF_MARK.shell);
  }

  function markContent(): void {
    if (launchReported) return;
    launchReported = true;
    // Measure after the frame that shows the rows, not the state update.
    afterPaint(() => {
      // A content surface that beat the layout's shell mark still reports a
      // launch; the two marks land in order, so neither duration is negative.
      if (!shellMarked) markShell();
      mark(APP_PERF_MARK.content);
      const shellMs = measure(
        `${APP_PERF_MARK.boot}-to-shell`,
        APP_PERF_MARK.boot,
        APP_PERF_MARK.shell
      );
      const contentMs = measure(
        `${APP_PERF_MARK.boot}-to-content`,
        APP_PERF_MARK.boot,
        APP_PERF_MARK.content
      );
      if (shellMs === null || contentMs === null) return;
      if (shellMs > APP_PERF_LAUNCH_MAX_MS || contentMs > APP_PERF_LAUNCH_MAX_MS) return;
      remember({
        version: 1,
        kind: 'launch',
        platform: platform(),
        cold: cold(),
        shellMs,
        contentMs,
      });
    });
  }

  function beginTap(): () => void {
    const tapMark = `${TAP_MARK_PREFIX}:${++taps}`;
    const paintMark = `${PAINT_MARK_PREFIX}:${taps}`;
    mark(tapMark);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      afterPaint(() => {
        mark(paintMark);
        const paintMs = measure(`${tapMark}-to-${PAINT_MARK_PREFIX}`, tapMark, paintMark);
        // One tap, one pair of marks: the taps that keep coming must not grow
        // the timeline for the rest of the session.
        try {
          perf.clearMarks(tapMark);
          perf.clearMarks(paintMark);
          perf.clearMeasures(`${tapMark}-to-${PAINT_MARK_PREFIX}`);
        } catch {
          // Clearing is housekeeping; the record is what matters.
        }
        if (paintMs === null || paintMs > APP_PERF_TAP_MAX_MS) return;
        remember({ version: 1, kind: 'tap', platform: platform(), paintMs });
      });
    };
  }

  return { markBoot, markShell, markContent, beginTap };
}

let shared: AppPerfMarks | null = null;

function marks(): AppPerfMarks {
  shared ??= createAppPerfMarks();
  return shared;
}

/** Marks the earliest client-side point of the launch. */
export function markBoot(): void {
  marks().markBoot();
}

/** Marks the app chrome's first committed frame. */
export function markShell(): void {
  marks().markShell();
}

/** Marks owned rows painted from the Local Store, and sends the launch record once. */
export function markContent(): void {
  marks().markContent();
}

/** Marks a local mutation's tap; call the returned function after the update that paints it. */
export function beginTap(): () => void {
  return marks().beginTap();
}

/**
 * `shell` for the Android shell, `pwa` for an installed app, `web` otherwise.
 * The Capacitor bridge is read inline rather than imported: `native-shell.ts`
 * imports `shared/contracts/auth`, which imports Zod, and this module rides the
 * client entry of every route.
 */
export function detectAppPerfPlatform(
  input: { userAgent?: string; standalone?: boolean; native?: boolean } = {}
): AppPerfPlatform {
  const userAgent =
    input.userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
  const native = input.native ?? isNativeShell();
  if (native || userAgent.includes(SHELL_USER_AGENT_TOKEN)) return 'shell';
  const standalone = input.standalone ?? prefersStandalone();
  return standalone ? 'pwa' : 'web';
}

/**
 * Whether this launch paid the network for its document. A reload and a
 * back/forward navigation are warm by definition; otherwise a document that
 * reports `transferSize === 0` came from Cache Storage or the HTTP cache, which
 * is what the program means by a warm open. No navigation entry (an unusual
 * WebView, an old browser) is reported as cold: the conservative reading.
 */
export function detectColdLaunch(entry?: { type?: string; transferSize?: number } | null): boolean {
  const navigation = entry === undefined ? navigationEntry() : entry;
  if (!navigation) return true;
  if (navigation.type === 'reload' || navigation.type === 'back_forward') return false;
  return navigation.transferSize !== 0;
}

function isNativeShell(): boolean {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function prefersStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari predates `display-mode` here; its own flag is the reliable read.
  if ((navigator as { standalone?: boolean }).standalone === true) return true;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function navigationEntry(): { type?: string; transferSize?: number } | null {
  if (typeof performance === 'undefined') return null;
  if (typeof performance.getEntriesByType !== 'function') return null;
  const [entry] = performance.getEntriesByType('navigation');
  return (entry as { type?: string; transferSize?: number } | undefined) ?? null;
}

function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

function defaultDefer(run: () => void): void {
  const idle = (
    globalThis as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (typeof idle === 'function') {
    idle(run, { timeout: 2000 });
    return;
  }
  setTimeout(run, 0);
}

function defaultAfterPaint(run: () => void): void {
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(run, 0);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(run));
}
