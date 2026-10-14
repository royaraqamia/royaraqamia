import { logger } from './logger';

/**
 * The service worker's update channel (ADR-0039, ADR-0042).
 *
 * A new worker installs as *waiting* rather than calling `skipWaiting`
 * (ADR-0030), so it only takes control once the document that blocked it is
 * gone. A long-lived document never goes away on its own — a backgrounded tab,
 * and above all the Android shell, which has no reload control at all — so
 * "any refresh updates it" is not true where it matters most. Two things close
 * that gap, and they answer different needs:
 *
 * 1. **A new build is announced** while the document stays open. `waiting` is
 *    the honest signal: the build is downloaded, verified and ready, and one
 *    gesture moves this document onto it (`applyWorkerUpdate`). The prompt that
 *    renders it is `frontend/ui/shared/update-prompt.tsx`.
 * 2. **A swap replaces the document** (ADR-0039). `activate` deletes the
 *    previous build's caches (`public/sw.js`), leaving a running document
 *    referencing chunks whose cache entries are gone, so the document reloads
 *    once when a *swapped* worker takes control, and re-checks for a new worker
 *    while it is visible — a worker script is otherwise only fetched at
 *    registration and on navigation, which can leave an installed app on the
 *    build it launched with for days.
 *
 * The reload is deferred while the document is hidden, so a background tab does
 * not reload under an in-flight form: the swap is remembered and applied on the
 * next visibility change. Prompting is deferred in the same way — a hidden
 * document is not reading a prompt — but dismissal is per document, so the next
 * launch still applies what this one declined (ADR-0042).
 *
 * Both halves depend on `CACHE_VERSION` changing per deployment —
 * `scripts/generate-icons.mjs` bakes the deployment id into `sw-version.js`,
 * which is what makes even a content-only deploy install a new worker. If that
 * key ever becomes a content hash of the worker itself, this channel goes quiet
 * for content-only deploys.
 */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60_000;

function isVisible(): boolean {
  return document.visibilityState === 'visible';
}

/** A worker whose install finished and which is waiting for this document to go. */
function waitingWorker(registration: ServiceWorkerRegistration | null | undefined) {
  return registration?.waiting ?? null;
}

/**
 * Whether this document is served by an older build with a newer one waiting:
 * the state the prompt is for. A missing controller means there is no previous
 * build to be behind — the first install is not an update.
 */
async function hasUpdateWaiting(serviceWorker: ServiceWorkerContainer): Promise<boolean> {
  try {
    const registration = await serviceWorker.getRegistration();
    return Boolean(waitingWorker(registration) && serviceWorker.controller);
  } catch (error) {
    logger.warn('Service worker update probe failed', { error: String(error) });
    return false;
  }
}

export type Reload = () => void;

/**
 * Moves *this* document onto the waiting worker, which is what the prompt's
 * button calls.
 *
 * `SKIP_WAITING` is the one case where the worker is told to activate early:
 * the user asked for it, so the swap it causes is not the destructive one
 * ADR-0030 rules out. The swap then goes through `controllerchange` below, so
 * the reload is the same single guarded reload as any other swap. With nothing
 * waiting there is nothing to skip to, so the gesture falls back to a plain
 * reload — a button that did nothing would be worse than a redundant load.
 */
export async function applyWorkerUpdate(
  serviceWorker: ServiceWorkerContainer,
  reload: Reload = () => window.location.reload()
): Promise<void> {
  try {
    const registration = await serviceWorker.getRegistration();
    const waiting = waitingWorker(registration);
    if (!waiting) {
      reload();
      return;
    }
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch (error) {
    logger.warn('Service worker update apply failed', { error: String(error) });
    reload();
  }
}

export interface WorkerUpdateOptions {
  /** How the document is replaced after a swap. */
  reload?: Reload;
  /** Called when the answer to "is there a waiting update?" changes. */
  onUpdateAvailable?: (available: boolean) => void;
}

/**
 * Watches for a new worker and for a swap, and applies the swap. Returns a
 * disposer that removes every listener and timer installed here.
 */
export function watchWorkerUpdates(
  serviceWorker: ServiceWorkerContainer,
  { reload = () => window.location.reload(), onUpdateAvailable }: WorkerUpdateOptions = {}
): () => void {
  // The controller is compared by identity, not presence: `controllerchange`
  // also fires on the very first install (`clients.claim` in `public/sw.js`),
  // where a reload would be a pointless double load, and a repeated event for
  // the worker already in control is not a swap either.
  let controller = serviceWorker.controller;
  let swapPending = false;
  let disposed = false;
  // Only report a change: the probe runs on every focus and every interval, and
  // the prompt should not re-render 96 times a day to say the same thing.
  let reported = false;

  const report = (available: boolean) => {
    if (disposed || !onUpdateAvailable || available === reported) return;
    reported = available;
    onUpdateAvailable(available);
  };

  const reportAvailability = () => {
    void hasUpdateWaiting(serviceWorker).then(report);
  };

  const applySwap = () => {
    if (!swapPending || !isVisible()) return;
    swapPending = false;
    reload();
  };

  const onControllerChange = () => {
    const next = serviceWorker.controller;
    if (controller !== null && next !== null && next !== controller) {
      swapPending = true;
    }
    controller = next;
    // Whoever is in control now is the build this document will be reloaded
    // onto, so there is nothing left to offer.
    report(false);
    applySwap();
  };

  // `ready` is the fallback for the moment before `PWAProvider` has finished
  // registering: it resolves with the active registration, however that arrives,
  // so an update cannot be missed because the check ran too early.
  const registrationFor = async () => {
    const existing = await serviceWorker.getRegistration();
    return existing ?? serviceWorker.ready;
  };

  /** A worker that is installing has not announced itself yet; its state will. */
  const watchInstalling = (registration: ServiceWorkerRegistration) => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') reportAvailability();
    });
  };

  const checkForUpdate = () => {
    if (disposed || !isVisible()) return;
    void registrationFor()
      .then(async (registration) => {
        // An already-waiting worker is an update this document declined or never
        // saw, and it is the first thing a returning visitor should be told.
        if (disposed) return;
        reportAvailability();
        watchInstalling(registration);
        await registration.update();
        if (disposed) return;
        // The install `update()` just started is a fresh `statechange` away.
        watchInstalling(registration);
        reportAvailability();
      })
      .catch((error) => {
        logger.warn('Service worker update check failed', { error: String(error) });
      });
  };

  const onVisible = () => {
    checkForUpdate();
    applySwap();
  };

  serviceWorker.addEventListener('controllerchange', onControllerChange);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  const timer = window.setInterval(onVisible, UPDATE_CHECK_INTERVAL_MS);
  // A document that is opened and left alone never fires focus: ask once now, so
  // an update that is already waiting is announced at load rather than at the
  // next time the user happens to change focus.
  checkForUpdate();

  return () => {
    disposed = true;
    serviceWorker.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.clearInterval(timer);
  };
}
