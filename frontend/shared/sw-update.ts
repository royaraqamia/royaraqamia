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
 *    surface: no prompt, no banner, nothing to decline.
 * 2. **A swap replaces the document** (ADR-0039, ADR-0170). A swapped worker
 *    may be the last one holding this build's chunks — the caches outlive a
 *    release since #488, and the byte budget evicts the previous build's
 *    entries first — so the document reloads once when a *swapped* worker takes
 *    control: a case the page does not choose, e.g. another tab took the
 *    deploy first.
 *
 * The line between them is what a live document is allowed to do: it is never
 * reloaded for its own sake. There is no timer, no focus check and no
 * visibility check that looks for a deploy (ADR-0134); a document that is only
 * sitting there stays on the build it was served, and moves at its next load.
 * The one reload the page does not choose is the one that can land under
 * someone's work, so it waits while the document holds work of its own
 * (`holdUnrequestedReload`, ADR-0170): a recording, an unsent draft, a staged
 * file. The work ends the wait; a hold that is never released means the
 * document simply stays on the build it was served, which is its owner's next
 * load to change.
 *
 * The take is bounded in two directions. It only runs while the document is
 * still the thing the user just opened — nothing is reloaded under someone who
 * has started reading or typing (`userHasActed`) — and it is remembered per
 * tab (`UPDATE_TAKE_GUARD_MS`), so a worker that fails to activate cannot put
 * the page in a reload loop.
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
 * It only has to outlast the swap, which is a frame's work; the reload the swap
 * causes is not this timer's business, because the document it replaces goes away
 * with the timer still in it. A take that lands nowhere cannot be recognised any
 * other way: the browser reports nothing at all for a worker that has already
 * been superseded, so silence has to be given a deadline.
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

const UPDATE_TAKE_GUARD_KEY = 'rr:sw-update-taken-at:v1';

/** Events that mean the person is using the page, not merely that it loaded. */
const USER_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'input', 'wheel'] as const;

export type Reload = () => void;

/** Every hold the document currently has, by nothing but its token. */
const reloadHolds = new Set<symbol>();

/**
 * The reloads waiting on those holds. A swap remembers itself and re-checks, so
 * a listener here only has to run the reload the work was blocking.
 */
const holdReleaseListeners = new Set<() => void>();

/**
 * The work a reload would destroy, held by the surfaces that own it.
 *
 * ADR-0039 lets a swapped worker replace the document without asking, because
 * the document may be left referencing chunks the new worker evicted. That
 * reload is the only one nobody chose, and it used to land on whatever was
 * happening at that second — measured 2026-11-12 (#1320): a five-minute voice
 * note died at its own stop, on a page that navigated itself.
 *
 * So the swap waits while a surface says it has work in hand. A held document
 * is not stuck: it keeps running on the build it was served, and the deploy
 * still reaches the tab at its next load — the swap is only this document's
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
 * last hold is released. This is what a swap and a take that landed nowhere
 * both owe the document; both go through it so neither can outrun a recording.
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
 * Whether a take already ran in this tab recently. A successful take leaves
 * nothing waiting, so the next load is quiet on its own; this only catches the
 * failure that would otherwise repeat forever.
 */
function takenRecently(storage: Storage | null = safeStorage()): boolean {
  try {
    const at = Number(storage?.getItem(UPDATE_TAKE_GUARD_KEY) ?? 0);
    return Number.isFinite(at) && at > 0 && Date.now() - at < UPDATE_TAKE_GUARD_MS;
  } catch {
    return false;
  }
}

function rememberTake(storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(UPDATE_TAKE_GUARD_KEY, String(Date.now()));
  } catch {
    // A tab without storage simply loses the loop guard, not the update.
  }
}

/** Watches for the page being used, so a take never lands under a reader. */
function watchUserInput() {
  let acted = false;
  const mark = () => {
    acted = true;
  };
  for (const type of USER_EVENTS) {
    window.addEventListener(type, mark, { capture: true, passive: true });
  }
  return {
    acted: () => acted,
    dispose: () => {
      for (const type of USER_EVENTS) {
        window.removeEventListener(type, mark, { capture: true });
      }
    },
  };
}

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
 * the destructive one ADR-0030 rules out. The swap then goes through
 * `controllerchange` in `watchWorkerUpdates`, so the reload is the same single
 * guarded reload as any other swap. With nothing waiting there is nothing to
 * skip to, so the call falls back to a plain reload — a take that did nothing
 * would be worse than a redundant load.
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
    window.setTimeout(() => {
      if (serviceWorker.controller !== controller) return;
      logger.warn('Service worker update take never landed', { deadlineMs });
      // The take is owed, not urgent: it waits out work in the same way the
      // swap does (ADR-0170), so a message that lands nowhere cannot reload the
      // document under a draft either.
      reloadWhenFree(reload);
    }, deadlineMs);
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
 * The update surface: a document load takes the waiting build, silently.
 *
 * Runs once per document, at load, and answers whether it took anything. The
 * order matters — ask the browser for a deploy, wait for the install it starts,
 * and only then decide — because the browser's own check is part of the
 * navigation and finishes after this function would otherwise have looked.
 *
 * It refuses in four cases, all of which mean "leave this document alone":
 * nothing was ever served by a worker (a first install is not an update), no
 * build is waiting, the person has already started using the page, or the shell
 * is announcing its own update. The guard against a repeated take is what makes
 * the single reload safe (ADR-0134).
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
    if (!isVisible() || input.acted()) return false;
    if (await isSuppressed()) return false;
    // The suppression answer is a network round trip; the person may have started
    // typing while it was in flight.
    if (!isVisible() || input.acted()) return false;

    rememberTake();
    void applyWorkerUpdate(serviceWorker, reload);
    return true;
  } catch (error) {
    logger.warn('Service worker update probe failed', { error: String(error) });
    return false;
  } finally {
    input.dispose();
  }
}

export interface WorkerUpdateOptions {
  /** How the document is replaced after a swap. */
  reload?: Reload;
}

/**
 * Replaces the document when a *swapped* worker takes control, once the document
 * is visible and has no work left to lose. A swap this page did not start —
 * another tab took the deploy — may have left this build's chunks only in a
 * cache the budget is willing to drop, so staying is a bet; the question the
 * page answers is only *when*, and the answer is "not under a recording or a
 * draft" (ADR-0170).
 *
 * The swap is remembered rather than acted on: while a hold is up the document
 * keeps running, and the release re-runs this, so the reload happens at the end
 * of the work instead of at the wrong end of it.
 *
 * The controller is compared by identity, not presence: `controllerchange` also
 * fires on the very first install (`clients.claim` in `public/sw.js`), where a
 * reload would be a pointless double load, and a repeated event for the worker
 * already in control is not a swap either.
 *
 * Returns a disposer that removes the listeners installed here.
 */
export function watchWorkerUpdates(
  serviceWorker: ServiceWorkerContainer,
  { reload = () => window.location.reload() }: WorkerUpdateOptions = {}
): () => void {
  let controller = serviceWorker.controller;
  let swapPending = false;

  const applySwap = () => {
    if (!swapPending || !isVisible() || heldForWork()) return;
    swapPending = false;
    reload();
  };

  const onControllerChange = () => {
    const next = serviceWorker.controller;
    if (controller !== null && next !== null && next !== controller) {
      swapPending = true;
    }
    controller = next;
    applySwap();
  };

  serviceWorker.addEventListener('controllerchange', onControllerChange);
  document.addEventListener('visibilitychange', applySwap);
  holdReleaseListeners.add(applySwap);

  return () => {
    serviceWorker.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', applySwap);
    holdReleaseListeners.delete(applySwap);
  };
}
