/**
 * PostgREST `or()` filters are comma and parenthesis delimited, so a search term
 * containing those characters would corrupt the filter expression rather than
 * fail loudly. Values are never interpolated into SQL, so this guards filter
 * syntax, not injection.
 */
export function sanitizeOrFilterTerm(term: string): string {
  return term.replace(/[,()]/g, ' ').trim();
}
