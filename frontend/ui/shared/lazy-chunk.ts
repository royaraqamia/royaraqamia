import { logger } from '@/frontend/shared/logger';

/**
 * What a lazy boundary renders when its chunk cannot be fetched.
 *
 * A component that renders nothing is a safe `default` for both `next/dynamic`
 * and `React.lazy`.
 */
function Nothing() {
  return null;
}

/**
 * Wraps a dynamic `import()` so a chunk that cannot be fetched degrades to a
 * component that renders nothing, instead of rejecting.
 *
 * Every lazy boundary in the app can be asked for its chunk while the radio is
 * off — a first tap, a `setTimeout 0` mount, an aborted prefetch — and a
 * rejected import is a *render* error: React hands it to the nearest error
 * boundary, which replaces that whole region. In the root layout that region is
 * the entire route, so a chunk that is merely missing costs the user the page
 * they were reading (docs/specs/offline-first.md, #332).
 *
 * A component whose chunk is missing can only cost itself: the page stays, the
 * data stays, and the missing piece is reported. `LazySection` guards its own
 * chunks the same way; this is that rule for the `dynamic()`/`lazy()` call sites.
 *
 * The fallback is permanent for that page load — React caches the resolved
 * module — which is deliberate: a chunk that failed offline is not worth
 * re-running the boundary for on every render.
 */
export function tolerateChunkFailure<M extends { default: unknown }>(
  label: string,
  load: () => Promise<M>
): () => Promise<M> {
  return () =>
    load().catch((error) => {
      logger.warn(`The ${label} chunk could not be loaded; rendering nothing instead`, {
        error: String(error),
      });
      return { default: Nothing } as unknown as M;
    });
}
