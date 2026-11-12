import { logger } from './logger';

/**
 * The service worker's update channel (ADR-0039, ADR-0134, ADR-0170).
 *
 * A new worker installs as *waiting* rather than calling `skipWaiting`
 * (ADR-0030), so it only takes control once the document that blocked it is
 * gone. A reload does not release it either — the client survives the
 * navigation, measured 2026-10-14 — so "any refresh updates it" is not true on
 * its own. Two things close that gap:
 *
 * 1. **A document load takes a waiting build** (`takeWaitingUpdateAtLoad`). The
 *    page checks for a deploy as it loads, and when one is downloaded and
 *    waiting it gives it control and reloads once. That is the whole update
 *    surface: no prompt, no banner, nothing to decline. The take is bounded by
 *    idleness rather than history (#1334): a document touched in the last few
 *    seconds (`UPDATE_IDLE_WINDOW_MS`) waits for that window to pass instead of
 *    refusing the load, and a load in a background tab takes the update when
 *    the tab becomes visible.
 * 2. **A swap does not replace the document** (ADR-0171). The worker records
 *    the build each client was served and keeps that build's chunks while the
 *    client is alive, so a swapped worker is no longer a reason to reload. The
 *    one reload left is the fallback for a chunk that genuinely 404s, which the
 *    worker reports to the document that asked for it.
 *
 * The line between them is what a live document is allowed to do: it is never
 * reloaded for its own sake. There is no timer, no focus check and no
 * visibility check that looks for a deploy (ADR-0134); a document that is only
 * sitting there stays on the build it was served, and moves at its next load.
 * The one reload the page does not choose is a document whose build is gone, so
 * it waits while the document holds work of its own (`holdUnrequestedReload`,
 * ADR-0170): a recording, an unsent draft, a staged file. The work ends the
 * wait; a hold that is never released means the document simply stays on the
 * build it was served, which is its owner's next load to change.
 *
 * The take is bounded in two directions. It only reloads a document that is not
 * being used right now (`UPDATE_IDLE_WINDOW_MS`) and is remembered per tab
 * (`UPDATE_TAKE_GUARD_MS`), so a worker that fails to activate cannot put the
 * page in a reload loop.
 *
 * Both halves depend on `CACHE_VERSION` changing per deployment —
 * `scripts/generate-icons.mjs` bakes the deployment id into `sw-version.js`,
 * which is what makes even a content-only deploy install a new worker. If that
 * key ever becomes a content hash of the worker itself, this channel goes quiet
 * for content-only deploys.
 */

/**
 * How long a posted `SKIP_WAITING` is given to replace this document's controller
 * before the take gives up on it and reloads instead.
 *
 * It only has to outlast the swap, which is a frame's work; a landed swap clears
 * the timer, and the reload that follows takes the document (and the timer) away.
 * A take that lands nowhere cannot be recognised any other way: the browser
 * reports nothing at all for a worker that has already been superseded, so
 * silence has to be given a deadline.
 */
export const UPDATE_APPLY_DEADLINE_MS = 5_000;

/**
 * How long a load waits for an install it started itself to finish.
 *
 * A deploy is usually *installing* rather than waiting when the load begins: the
 * browser's own check for a new worker script runs as part of the navigation,
 * which is too late for this document to see the result. Asking again
 * (`registration.update()`) finds it, and this is the ceiling on waiting for it
 * before the document gives up and stays on the build it has — the next load
 * tries again.
 */
export const UPDATE_TAKE_INSTALL_DEADLINE_MS = 20_000;

/**
 * How long a take is remembered per tab. Inside this window a second take is
 * refused, which is the only thing standing between a worker that never
 * activates and an endless reload; outside it a genuinely newer deploy is taken
 * as usual.
 */
export const UPDATE_TAKE_GUARD_MS = 60_000;

/**
 * How long after the last interaction a document still counts as in use.
 *
 * The take used to refuse a load forever once anything had been touched in it
 * (`userHasActed`, ADR-0134). That made a reload plus four seconds of scrolling
 * refuse the whole load, and the deploy only landed on a later load — measured
 * on 2026-11-12 (#1320, #1334). A window is the honest question instead: a
 * scroll defers the reload by seconds, and the document takes the build as soon
 * as the person pauses.
 */
export const UPDATE_IDLE_WINDOW_MS = 3_000;

/** Slack on the re-check, so the timer fires after the window rather than inside it. */
const UPDATE_IDLE_RECHECK_MS = 50;

const UPDATE_TAKE_GUARD_KEY = 'rr:sw-update-taken-at:v1';
const STALE_RELOAD_GUARD_KEY = 'rr:sw-stale-reloaded-at:v1';

/** Events that mean the person is using the page, not merely that it loaded. */
const USER_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'input', 'wheel'] as const;

export type Reload = () => void;

/** Every hold the document currently has, by nothing but its token. */
const reloadHolds = new Set<symbol>();

/**
 * The reloads waiting on those holds. A stale-build report remembers itself and
 * re-checks, so a listener here only has to run the reload the work was blocking.
 */
const holdReleaseListeners = new Set<() => void>();

/**
 * The work a reload would destroy, held by the surfaces that own it.
 *
 * Two reloads remain that the person did not ask for: the take's deadline when a
 * `SKIP_WAITING` lands on a worker that has already been superseded (ADR-0055),
 * and the fallback for a chunk whose build is genuinely gone (ADR-0171). Both
 * used to be able to land on whatever was happening at that second — measured
 * 2026-11-12 (#1320): a five-minute voice note died at its own stop, on a page
 * that navigated itself.
 *
 * So both wait while a surface says it has work in hand. A held document is not
 * stuck: it keeps running on the build it was served, and the deploy still
 * reaches the tab at its next load — the reload is only this document's
 * replacement, never the update itself.
 *
 * Callers get a release function back and are expected to release it on the
 * work's own end: sent, discarded, stopped, or the surface unmounting. A hold
 * that outlives its work is a leak, and its only cost is a document that stays
 * on its build until the next navigation.
 */
export function holdUnrequestedReload(): () => void {
  const token = Symbol('unrequested-reload-hold');
  reloadHolds.add(token);
  return () => {
    if (!reloadHolds.delete(token)) return;
    if (reloadHolds.size > 0) return;
    for (const listener of [...holdReleaseListeners]) listener();
  };
}

function heldForWork(): boolean {
  return reloadHolds.size > 0;
}

/**
 * Runs the reload once the document has no work left to lose — now, or when the
 * last hold is released. This is what a take that landed nowhere and a stale
 * build both owe the document; both go through it so neither can outrun a
 * recording.
 */
function reloadWhenFree(reload: Reload): void {
  if (!heldForWork()) {
    reload();
    return;
  }
  const pending = () => {
    if (heldForWork()) return;
    holdReleaseListeners.delete(pending);
    reload();
  };
  holdReleaseListeners.add(pending);
}

function isVisible(): boolean {
  return document.visibilityState === 'visible';
}

/** A worker whose install finished and which is waiting for this document to go. */
function waitingWorker(registration: ServiceWorkerRegistration | null | undefined) {
  return registration?.waiting ?? null;
}

function safeStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Whether a marker was written recently. A successful take leaves nothing
 * waiting, so the next load is quiet on its own; this only catches the failure
 * that would otherwise repeat forever. The stale-build reload uses the same
 * bound for the same reason: a document that comes back to a chunk that is still
 * 404 must not reload again and again.
 */
function recently(key: string, storage: Storage | null = safeStorage()): boolean {
  try {
    const at = Number(storage?.getItem(key) ?? 0);
    return Number.isFinite(at) && at > 0 && Date.now() - at < UPDATE_TAKE_GUARD_MS;
  } catch {
    return false;
  }
}

function remember(key: string, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(key, String(Date.now()));
  } catch {
    // A tab without storage simply loses the loop guard, not the update.
  }
}

function takenRecently(): boolean {
  return recently(UPDATE_TAKE_GUARD_KEY);
}

function rememberTake(): void {
  remember(UPDATE_TAKE_GUARD_KEY);
}

/** Watches when the page was last used, so a take lands in a pause, not under a reader. */
function watchUserInput() {
  let lastAt = 0;
  const mark = () => {
    lastAt = Date.now();
  };
  for (const type of USER_EVENTS) {
    window.addEventListener(type, mark, { capture: true, passive: true });
  }
  return {
    /** Touched recently enough that a reload would land under the person. */
    busy: () => lastAt > 0 && Date.now() - lastAt < UPDATE_IDLE_WINDOW_MS,
    /** How long since the last touch, or `Infinity` when there was none. */
    idleFor: () => (lastAt === 0 ? Infinity : Date.now() - lastAt),
    dispose: () => {
      for (const type of USER_EVENTS) {
        window.removeEventListener(type, mark, { capture: true });
      }
    },
  };
}

type InputWatch = ReturnType<typeof watchUserInput>;

/**
 * Waits for the install the check just started to reach `installed`, which is
 * when the registration has a worker waiting. A worker that has no install in
 * flight resolves at once; the deadline stops a slow download from holding the
 * load's take open indefinitely.
 */
function waitForInstall(
  registration: ServiceWorkerRegistration,
  deadlineMs: number
): Promise<void> {
  const installing = registration.installing;
  if (!installing) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const finish = () => {
      installing.removeEventListener('statechange', onChange);
      window.clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (
        installing.state === 'installed' ||
        installing.state === 'activated' ||
        installing.state === 'redundant'
      ) {
        finish();
      }
    };
    const timer = window.setTimeout(finish, deadlineMs);
    installing.addEventListener('statechange', onChange);
  });
}

/**
 * Moves *this* document onto the waiting worker.
 *
 * `SKIP_WAITING` is the one case where the worker is told to activate early: the
 * document is loading or the person asked for it, so the swap it causes is not
 * the destructive one ADR-0030 rules out. A take is a chosen reload, so this
 * function owns it: the controller changing is the signal that the new worker
 * landed, and the document replaces itself once, here, rather than in the swap
 * watcher (which no longer reloads, ADR-0171). With nothing waiting there is
 * nothing to skip to, so the call falls back to a plain reload — a take that did
 * nothing would be worse than a redundant load.
 *
 * That fallback is a deadline, not just a branch for the missing worker, because
 * the take names a worker that was waiting when it was probed: by the time it
 * lands, a newer install can have superseded it, and the browser answers a
 * message to a worker that is no longer waiting by doing nothing at all — no
 * event, no error, no swap (ADR-0055). The deadline is the only way to notice
 * that silence, and the reload it causes is the one that was owed.
 */
export async function applyWorkerUpdate(
  serviceWorker: ServiceWorkerContainer,
  reload: Reload = () => window.location.reload(),
  deadlineMs: number = UPDATE_APPLY_DEADLINE_MS
): Promise<void> {
  try {
    const registration = await serviceWorker.getRegistration();
    const waiting = waitingWorker(registration);
    if (!waiting) {
      reload();
      return;
    }
    // A landed swap replaces the controller, so the controller's identity is the
    // one honest answer to "did the take do anything?".
    const controller = serviceWorker.controller;
    let settled = false;
    let timer: number | null = null;

    function finish(action: () => void) {
      if (settled) return;
      settled = true;
      if (timer !== null) window.clearTimeout(timer);
      serviceWorker.removeEventListener('controllerchange', onChange);
      action();
    }

    function onChange() {
      if (serviceWorker.controller !== controller) finish(reload);
    }

    timer = window.setTimeout(() => {
      finish(() => {
        logger.warn('Service worker update take never landed', { deadlineMs });
        // The take is owed, not urgent: it waits out work in the same way the
        // swap does (ADR-0170), so a message that lands nowhere cannot reload the
        // document under a draft either.
        reloadWhenFree(reload);
      });
    }, deadlineMs);
    serviceWorker.addEventListener('controllerchange', onChange);
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch (error) {
    logger.warn('Service worker update take failed', { error: String(error) });
    reload();
  }
}

export interface TakeUpdateOptions {
  serviceWorker?: ServiceWorkerContainer | null;
  reload?: Reload;
  /**
   * Another channel is already moving this install forward — the shell's own
   * update card (ADR-0043) — so the page has nothing to add. Asked after the
   * waiting worker is known, and awaited, because the answer needs the shell's
   * manifest.
   */
  isSuppressed?: () => boolean | Promise<boolean>;
  installDeadlineMs?: number;
}

/**
 * Arms a take for a document that is busy or hidden right now (#1334).
 *
 * Called once, when the load's probe finds a waiting build but the moment is
 * wrong. Three things end the wait, and all of them are the document's own
 * state rather than a timer that guesses:
 *
 * - **Idle.** A timer fires `UPDATE_IDLE_WINDOW_MS` after the last touch, and
 *   the take runs if the person has not touched the page again. A scroll
 *   therefore defers the deploy by seconds instead of deferring it to a later
 *   load, which is the case #1320 measured.
 * - **Visible.** A hidden document installs no timer — reloading a background
 *   tab saves nothing (ADR-0039) — and the `visibilitychange` listener is what
 *   makes a load in a background tab count as a load at all.
 * - **Gone.** A newer install supersedes the waiting one, or the tab takes a
 *   build elsewhere and the guard is set; either way there is nothing left to
 *   take, and the watcher stops.
 *
 * `UPDATE_TAKE_GUARD_MS` still bounds the loop: a take that failed to activate
 * would otherwise come back on the next idle window forever.
 */
function deferTake({
  serviceWorker,
  registration,
  reload,
  isSuppressed,
  input,
}: {
  serviceWorker: ServiceWorkerContainer;
  registration: ServiceWorkerRegistration;
  reload: Reload;
  isSuppressed: () => boolean | Promise<boolean>;
  input: InputWatch;
}): void {
  let timer: number | null = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibility);
    input.dispose();
  };

  const run = async () => {
    if (stopped) return;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (!registration.waiting || takenRecently()) {
      stop();
      return;
    }
    // Hidden: the visibility listener is the only thing that resumes this.
    if (!isVisible()) return;
    if (input.busy()) {
      schedule();
      return;
    }
    if (await isSuppressed()) {
      stop();
      return;
    }
    if (stopped) return;
    // The suppression answer is a round trip; the person may have started typing
    // while it was in flight.
    if (!isVisible() || input.busy()) {
      schedule();
      return;
    }
    rememberTake();
    stop();
    void applyWorkerUpdate(serviceWorker, reload);
  };

  const schedule = () => {
    if (stopped || timer !== null || !isVisible()) return;
    const wait = Math.max(0, UPDATE_IDLE_WINDOW_MS - input.idleFor()) + UPDATE_IDLE_RECHECK_MS;
    timer = window.setTimeout(() => {
      timer = null;
      void run();
    }, wait);
  };

  function onVisibility() {
    if (isVisible()) void run();
  }

  document.addEventListener('visibilitychange', onVisibility);
  schedule();
}

/**
 * The update surface: a document load takes the waiting build, silently.
 *
 * Runs once per document, at load, and answers whether it took anything. The
 * order matters — ask the browser for a deploy, wait for the install it starts,
 * and only then decide — because the browser's own check is part of the
 * navigation and finishes after this function would otherwise have looked.
 *
 * It refuses when nothing was ever served by a worker (a first install is not
 * an update), when no build is waiting, or while the shell is announcing its
 * own update. A document that is being used or is in the background does not
 * refuse the load: the take is armed to run in the next pause, or when the tab
 * comes back (`deferTake`). The guard against a repeated take is what makes the
 * single reload safe (ADR-0134).
 */
export async function takeWaitingUpdateAtLoad({
  serviceWorker = typeof navigator === 'undefined' ? null : navigator.serviceWorker,
  reload = () => window.location.reload(),
  isSuppressed = () => false,
  installDeadlineMs = UPDATE_TAKE_INSTALL_DEADLINE_MS,
}: TakeUpdateOptions = {}): Promise<boolean> {
  // A document that has no controller was never served by an older build, so
  // there is nothing for it to be behind.
  if (!serviceWorker?.controller) return false;
  if (takenRecently()) return false;

  const input = watchUserInput();
  let handedOff = false;
  try {
    const registration = (await serviceWorker.getRegistration()) ?? (await serviceWorker.ready);

    // A deploy that landed since this document was cached is normally still
    // installing; a navigation's own check starts too late to be seen here.
    try {
      await registration.update();
    } catch (error) {
      // The check failing says nothing about a worker that is already waiting.
      logger.warn('Service worker update check failed', { error: String(error) });
    }
    await waitForInstall(registration, installDeadlineMs);

    // `waiting` is the honest signal: downloaded, verified, ready, and costs one
    // reload that works offline.
    if (!registration.waiting) return false;
    if (await isSuppressed()) return false;

    if (!isVisible() || input.busy()) {
      // The watcher owns `input` from here; disposing it in `finally` would
      // leave the deferred take unable to tell a pause from a busy page.
      handedOff = true;
      deferTake({ serviceWorker, registration, reload, isSuppressed, input });
      return false;
    }

    rememberTake();
    void applyWorkerUpdate(serviceWorker, reload);
    return true;
  } catch (error) {
    logger.warn('Service worker update probe failed', { error: String(error) });
    return false;
  } finally {
    if (!handedOff) input.dispose();
  }
}

export interface WorkerUpdateOptions {
  /** How the document is replaced when its build is gone. */
  reload?: Reload;
}

/**
 * Replaces the document only when the worker says its build is genuinely gone.
 *
 * A swap no longer reloads (ADR-0171): the worker records the build each client
 * was served and keeps that build's chunks while the client is alive, so a
 * swapped worker is not the last holder of anything. What is left is the true
 * failure — a `_next/static` request that neither the cache nor the network can
 * answer, which the worker reports as `STALE_BUILD` for the client that asked.
 * Only that document can be replaced, and only when it is visible and has no
 * work left to lose: a recording or a draft waits out the end of its work
 * (ADR-0170), and a background tab waits for its next visible moment.
 *
 * The reload is remembered rather than acted on: while a hold is up the document
 * keeps running, and the release re-runs this, so the reload happens at the end
 * of the work instead of at the wrong end of it.
 *
 * Returns a disposer that removes the listeners installed here.
 */
export function watchWorkerUpdates(
  serviceWorker: ServiceWorkerContainer,
  { reload = () => window.location.reload() }: WorkerUpdateOptions = {}
): () => void {
  let stalePending = false;

  const applyReload = () => {
    if (!stalePending || !isVisible() || heldForWork()) return;
    stalePending = false;
    // The document that comes back may still 404 on the same chunk if the build
    // is not really replaceable (a bad URL, a deploy that broke mid-flight). The
    // guard makes that a page on a broken build, never a reload loop.
    if (recently(STALE_RELOAD_GUARD_KEY)) return;
    remember(STALE_RELOAD_GUARD_KEY);
    reload();
  };

  const onMessage = (event: MessageEvent) => {
    if (event?.data?.type !== 'STALE_BUILD') return;
    stalePending = true;
    applyReload();
  };

  serviceWorker.addEventListener('message', onMessage);
  document.addEventListener('visibilitychange', applyReload);
  holdReleaseListeners.add(applyReload);

  return () => {
    serviceWorker.removeEventListener('message', onMessage);
    document.removeEventListener('visibilitychange', applyReload);
    holdReleaseListeners.delete(applyReload);
  };
}
