import { logger } from './logger';

/**
 * The service worker's update channel (ADR-0039).
 *
 * A new worker installs as *waiting* rather than calling `skipWaiting`
 * (ADR-0030), so it only takes control once the document that blocked it is
 * gone. A long-lived document never goes away on its own — a backgrounded tab,
 * and above all the Android shell, which has no reload control at all — so
 * "any refresh updates it" is not true where it matters most. This closes that
 * gap from the page side, without inventing a prompt:
 *
 * 1. Re-check for a new worker while the document is visible. The worker script
 *    is otherwise only fetched at registration and on navigation, so an
 *    installed app can keep the build it launched with for days.
 * 2. Reload once when a *swapped* worker takes control. `activate` deletes the
 *    previous build's caches (`public/sw.js`), leaving the running document
 *    referencing chunks whose cache entries are gone; the reload replaces the
 *    document with the build its worker serves.
 *
 * The reload is deferred while the document is hidden, so a background tab does
 * not reload under an in-flight form: the swap is remembered and applied on the
 * next visibility change.
 *
 * This is the only update signal, and it depends on `CACHE_VERSION` changing per
 * deployment — `scripts/generate-icons.mjs` bakes the deployment id into
 * `sw-version.js`, which is what makes even a content-only deploy install a new
 * worker. If that key ever becomes a content hash of the worker itself, this
 * channel goes quiet for content-only deploys.
 */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60_000;

function isVisible(): boolean {
  return document.visibilityState === 'visible';
}

/**
 * Watches for a worker swap and applies it. Returns a disposer that removes
 * every listener and timer installed here.
 */
export function watchWorkerUpdates(
  serviceWorker: ServiceWorkerContainer,
  reload: () => void = () => window.location.reload()
): () => void {
  // The controller is compared by identity, not presence: `controllerchange`
  // also fires on the very first install (`clients.claim` in `public/sw.js`),
  // where a reload would be a pointless double load, and a repeated event for
  // the worker already in control is not a swap either.
  let controller = serviceWorker.controller;
  let swapPending = false;

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
    applySwap();
  };

  const checkForUpdate = () => {
    if (!isVisible()) return;
    serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
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

  return () => {
    serviceWorker.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.clearInterval(timer);
  };
}
