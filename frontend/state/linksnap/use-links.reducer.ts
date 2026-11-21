import type { ShortenedLink } from '@/frontend/api/linksnap';

/**
 * The network-backed list the shortener paints outside a `LinksnapProvider`:
 * the rows, the read in flight and the read that failed.
 *
 * `fetchLinks` wrote all three from one `try/finally`, and a delete or an edit
 * rewrote the rows from their previous value — so they are one state here.
 */
export interface LinksListState {
  links: ShortenedLink[];
  loading: boolean;
  error: string | null;
}

export type LinksListAction =
  /** A row was removed by its `clientId` (or `code` when it has none). */
  | { type: 'loadStarted' }
  | { type: 'loaded'; links: ShortenedLink[] }
  | { type: 'loadFailed'; message: string }
  | { type: 'linkRemoved'; key: string }
  | { type: 'linkUpdated'; key: string; link: ShortenedLink };

export function linksListInitialState(): LinksListState {
  return { links: [], loading: true, error: null };
}

export function linksListReducer(state: LinksListState, action: LinksListAction): LinksListState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loading: true, error: null };

    case 'loaded':
      return { ...state, links: action.links, loading: false };

    case 'loadFailed':
      return { ...state, error: action.message, loading: false };

    case 'linkRemoved':
      return {
        ...state,
        links: state.links.filter(
          (link) => (link.clientId ?? link.code) !== action.key && link.code !== action.key
        ),
      };

    case 'linkUpdated':
      return {
        ...state,
        links: state.links.map((link) =>
          (link.clientId ?? link.code) === action.key ? { ...link, ...action.link } : link
        ),
      };
  }
}
