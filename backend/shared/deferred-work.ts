/**
 * Work that runs after the response without being awaited on the request path.
 *
 * It lives in `shared` because a service may not import another product's
 * service and a service may not import the composition root: the chat turn and
 * the short-link redirect both defer work, and neither should have to import
 * the other to name the type.
 */

/** Executes work after the response without awaiting it on the request path. */
export type DeferredWork = (promise: Promise<unknown>) => void;

/**
 * Default: fire and forget. Fluid compute may cut an instance as soon as the
 * response is sent, so a route that can keep it alive passes `after()` in and
 * the work settles instead of being silently lost.
 */
export const fireAndForget: DeferredWork = (promise) => void promise;
