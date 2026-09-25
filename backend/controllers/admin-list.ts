/**
 * The plumbing every Admin list endpoint repeats: bound the page and page size,
 * keep a status filter only when it belongs to the feature's own set, and drop
 * a blank search rather than sending an empty filter.
 *
 * The `status` a route receives is an untrusted `string | null | undefined`; the
 * feature hands in its own guard (built with `createStatusGuard`) so this module
 * stays free of any one product's vocabulary.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** The normalised query an Admin list controller hands to its service. */
export interface AdminListQuery<Status extends string> {
  page: number;
  pageSize: number;
  status?: Status;
  search?: string;
}

export function normalizePage(page: number): number {
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export function normalizePageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

/** Builds the membership predicate that narrows an untrusted status string. */
export function createStatusGuard<Status extends string>(
  statuses: readonly Status[]
): (value: string) => value is Status {
  const known = new Set<string>(statuses);
  return (value: string): value is Status => known.has(value);
}

/**
 * Turns the raw `page`/`pageSize`/`status`/`search` a list route receives into
 * the bounded query its service expects: a page is floored to at least 1, a page
 * size is clamped, a status is kept only when the feature's guard recognises it,
 * and a whitespace-only search is dropped.
 */
export function parseAdminListQuery<Status extends string>(
  page: number,
  pageSize: number,
  status: string | null | undefined,
  search: string | null | undefined,
  isStatus: (value: string) => value is Status
): AdminListQuery<Status> {
  return {
    page: normalizePage(page),
    pageSize: normalizePageSize(pageSize),
    status: status && isStatus(status) ? status : undefined,
    search: search?.trim() || undefined,
  };
}
