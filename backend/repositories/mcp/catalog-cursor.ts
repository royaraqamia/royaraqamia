import { z } from 'zod';

/**
 * Keyset cursor for the MCP catalogue (phase 2, #1223).
 *
 * The list is ordered `registry_name ASC` — the registry's own key, unique by
 * definition — so a cursor is just the last row's key. Ordering by title would
 * read nicer and cost a two-key cursor interpolated into a PostgREST `or()`,
 * which is the filter-syntax hazard `backend/shared/postgrest-or-filter.ts`
 * exists for; the catalogue is searched, not ranked, so the safe order wins.
 *
 * The encoded value is opaque to clients and re-validated on decode: it becomes
 * a filter value, and a name that carries `,`, `(` or `)` would corrupt the
 * expression rather than fail.
 */

/** `ac.inference.sh/mcp`, `com.supabase/mcp`: a reverse-DNS name and a path. */
const REGISTRY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9._-]+)+$/;

const CatalogCursorSchema = z.object({
  n: z.string().regex(REGISTRY_NAME),
});

export function encodeCatalogCursor(registryName: string): string {
  return Buffer.from(JSON.stringify({ n: registryName })).toString('base64url');
}

/** `null` for anything that is not a cursor we wrote; the caller starts over. */
export function decodeCatalogCursor(raw: string): string | null {
  try {
    const parsed = CatalogCursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString())
    );
    return parsed.success ? parsed.data.n : null;
  } catch {
    return null;
  }
}

/**
 * The search term as a `LIKE` pattern body.
 *
 * `%` and `_` are the pattern's own wildcards, so a member typing `100%` would
 * otherwise search for everything: they are escaped, along with the escape
 * character itself. Commas and parentheses are dropped for the reason
 * `sanitizeOrFilterTerm` drops them — PostgREST's filter syntax is
 * comma-delimited, and this value is a filter value.
 */
export function catalogSearchPattern(term: string): string {
  return term.replace(/[,()]/g, ' ').replace(/[\\%_]/g, (character) => `\\${character}`);
}
