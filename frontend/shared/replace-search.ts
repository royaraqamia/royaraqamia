/**
 * Writes a query string into the address bar without a navigation.
 *
 * Filter state is a view of the page it is on, not a second screen (ADR-0147):
 * a currency pair or an open tafsir has to survive a refresh and be shareable,
 * but routing there would refetch the document and remount the widget that owns
 * the rest of the state. `replaceState` keeps the entry the member is already
 * on, so Back still leaves the page instead of walking back through filters.
 *
 * The hash is preserved: `/quran/2#ayah-5` keeps its anchor when `?tafsir=5`
 * joins it.
 */
export function replaceSearch(search: string): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.search = search;

  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
