import type { NewsCategory } from '@/shared/contracts/news';

/**
 * Which digest a `/news` URL asks for.
 *
 * `mine` is the reader's own digest and it is the default: the URL carries a
 * `view` only when the shared one was asked for, and anything else — absent,
 * `mine` — reads as the reader's own (`parseNewsView`,
 * `backend/loaders/news.ts`). Keeping the default out of the URL keeps one
 * address for one digest.
 */
export type NewsView = 'mine' | 'public';

/** The digest a URL names, by the same rule the server reads it with. */
export function newsViewFrom(value: string | null): NewsView {
  return value === 'public' ? 'public' : 'mine';
}

/**
 * A `/news` URL for a query, keeping the digest it was asked for (#639).
 *
 * A filter or a search is not a view change: it rewrites the query and leaves
 * the reader looking at the digest they picked, so `view` travels with `q`,
 * `category` and `date` instead of being dropped by the rewrite.
 */
export function newsHref(
  pathname: string,
  state: {
    q?: string;
    category?: NewsCategory | null;
    date?: string | null;
    view: NewsView;
  }
): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.date) params.set('date', state.date);
  if (state.view === 'public') params.set('view', 'public');

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
