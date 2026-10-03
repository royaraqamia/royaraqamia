import { z } from 'zod';

/**
 * Keyset cursor for the public community feed.
 *
 * The feed is ordered `published_at DESC NULLS FIRST, id DESC`, so a cursor is
 * the sort key of the last row of a page: its `published_at` (nullable, because
 * scheduled-but-due rows have none) and its `id` as the stable tiebreaker.
 *
 * The encoded value is opaque to clients. It is re-validated on decode because
 * the timestamp is interpolated into a PostgREST filter — the strict patterns
 * keep `,`, `(` and `)` (the `or()` delimiters) out of the value.
 */
export interface FeedCursor {
  publishedAt: string | null;
  id: string;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const FeedCursorSchema = z.object({
  p: z.string().regex(ISO_TIMESTAMP).nullable(),
  i: z.string().regex(UUID),
});

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify({ p: cursor.publishedAt, i: cursor.id })).toString('base64url');
}

export function decodeFeedCursor(raw: string): FeedCursor | null {
  try {
    const parsed = FeedCursorSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString()));
    if (!parsed.success) return null;
    return { publishedAt: parsed.data.p, id: parsed.data.i };
  } catch {
    return null;
  }
}

/**
 * PostgREST `or()` filter selecting the rows that come strictly after `cursor`
 * in `published_at DESC NULLS FIRST, id DESC` order.
 */
export function feedCursorFilter(cursor: FeedCursor): string {
  if (cursor.publishedAt === null) {
    // NULLs sort first: remaining NULL rows with a smaller id, then every non-NULL row.
    return `and(published_at.is.null,id.lt.${cursor.id}),published_at.not.is.null`;
  }
  return `published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`;
}
