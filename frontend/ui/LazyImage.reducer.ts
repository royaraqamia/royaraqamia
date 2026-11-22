/**
 * One image's load state: the source it is showing, whether it has painted, and
 * whether it gave up. The error path depends on what it is currently showing (a
 * WebP fallback is tried once), so the three are one state here.
 */
export interface LazyImageState {
  currentSrc: string;
  isLoaded: boolean;
  hasError: boolean;
}

export type LazyImageAction =
  | { type: 'loaded' }
  /** The current source failed; the original is tried once before giving up. */
  | { type: 'failed'; src: string; webpSrc?: string };

export function lazyImageInitialState(src: string, webpSrc?: string): LazyImageState {
  return { currentSrc: webpSrc ?? src, isLoaded: false, hasError: false };
}

export function lazyImageReducer(state: LazyImageState, action: LazyImageAction): LazyImageState {
  switch (action.type) {
    case 'loaded':
      return state.isLoaded ? state : { ...state, isLoaded: true };

    case 'failed':
      // The WebP was a first try: fall back to the original once, then report a
      // real failure. A source with no WebP goes straight to the failure.
      if (action.webpSrc && state.currentSrc === action.webpSrc && action.src !== action.webpSrc) {
        return { ...state, currentSrc: action.src };
      }
      return state.hasError ? state : { ...state, hasError: true };
  }
}
