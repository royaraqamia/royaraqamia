/**
 * One page of a list result, shared by every Admin queue.
 *
 * The same shape travels the whole stack — repository → service → controller →
 * frontend client — so each layer answers "rows plus total" identically and the
 * `Pagination` control can count pages without knowing which feature it is in.
 */
export interface Paginated<T> {
  data: T[];
  total: number;
}
