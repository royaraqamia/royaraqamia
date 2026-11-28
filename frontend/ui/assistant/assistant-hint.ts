/**
 * The one bit the launcher keeps (ADR-0150): whether this browser has opened
 * نور before, so a returning reader's chunk may warm while the page is idle.
 *
 * Deliberately its own module with no imports. The launcher is mounted by the
 * root layout on every page, and the conversation's chunk must not come with
 * it (ADR-0143); the cache module imports the chats Local Store, so this hint
 * cannot live there.
 */

/** The one storage entry the warm-up reads; `perf/runtime-weight.json` seeds it. */
export const ASSISTANT_OPENED_KEY = 'royaraqamia:assistant:opened';

function browserStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    // A sandboxed iframe or a private mode that throws: no warm start.
    return null;
  }
}

/** Marks that this browser has opened the panel. */
export function rememberAssistantOpened(): void {
  try {
    browserStorage()?.setItem(ASSISTANT_OPENED_KEY, '1');
  } catch {
    // The warm start is a nicety; the click still loads the chunk.
  }
}

/** Whether a previous visit opened the panel in this browser. */
export function assistantWasOpened(): boolean {
  try {
    return browserStorage()?.getItem(ASSISTANT_OPENED_KEY) === '1';
  } catch {
    return false;
  }
}
