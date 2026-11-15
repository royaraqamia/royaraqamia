import type { ScreenScope } from '@/frontend/state/screen-scopes';
import type { NewsView } from './news-url';

/**
 * What `/news` registers while the digest is on screen (ADR-0181, #1420).
 *
 * The view is the one thing the route cannot name: `?view=mine` and the public
 * digest are the same path, so a member asking "what does this mean?" about a
 * story on their own digest is on a different screen than a visitor reading the
 * public one. The search and category chips stay in the URL, where the route
 * provider already reads them.
 */
export function newsScreenScope(view: NewsView): ScreenScope {
  return { id: 'news.page', kind: 'screen', tab: view };
}
