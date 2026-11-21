import type { AdminStats } from '@/frontend/api/linksnap';

/**
 * The admin directory's read and its one row action: the stats it painted, the
 * read in flight, the row whose moderation is in flight and the two sentences
 * that can sit above it.
 *
 * `loadStats` wrote the stats, the read flag and the error from one
 * `try/finally`, and a successful moderation rewrote the stats and cleared the
 * row's flag together — so they are one state here.
 */
export interface AdminLinksState {
  stats: AdminStats | null;
  loading: boolean;
  error: string | null;
  actionLoadingCode: string | null;
  moderateError: string | null;
}

export type AdminLinksAction =
  | { type: 'loadStarted' }
  | { type: 'loaded'; stats: AdminStats }
  | { type: 'loadFailed'; message: string }
  | { type: 'moderationStarted'; code: string }
  | { type: 'moderationSucceeded'; code: string; blocked: boolean }
  | { type: 'moderationFailed'; message: string }
  | { type: 'moderateErrorSet'; message: string | null };

export function adminLinksInitialState(): AdminLinksState {
  return {
    stats: null,
    loading: true,
    error: null,
    actionLoadingCode: null,
    moderateError: null,
  };
}

export function adminLinksReducer(
  state: AdminLinksState,
  action: AdminLinksAction
): AdminLinksState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loading: true, error: null };

    case 'loaded':
      return { ...state, stats: action.stats, loading: false };

    case 'loadFailed':
      return { ...state, error: action.message, loading: false };

    case 'moderationStarted':
      return { ...state, actionLoadingCode: action.code, moderateError: null };

    case 'moderationSucceeded': {
      if (!state.stats) return { ...state, actionLoadingCode: null };
      const links = (state.stats.links || []).map((link) =>
        link.code === action.code ? { ...link, isBlocked: action.blocked } : link
      );
      return {
        ...state,
        actionLoadingCode: null,
        stats: {
          ...state.stats,
          blockedLinksCount: state.stats.blockedLinksCount + (action.blocked ? 1 : -1),
          links,
        },
      };
    }

    case 'moderationFailed':
      return { ...state, moderateError: action.message, actionLoadingCode: null };

    case 'moderateErrorSet':
      return { ...state, moderateError: action.message };
  }
}
