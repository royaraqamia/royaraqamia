import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * The block-aware thread read is exercised in the repository with a fake RPC,
 * so nothing below that seam can notice a renamed argument or a grant that
 * leaked the function to a client role. These assertions read the migration
 * itself — the same guard the post-engagement migration has.
 */

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20261228000000_post_comments_block_aware_reads.sql'
);

const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ' ');

describe('block-aware comment page migration', () => {
  it('filters with the shared helper on both directions of a block', () => {
    expect(code).toMatch(/private\.not_blocked_with\(c\.author_id, p_viewer_id\)/i);
    expect(code).toMatch(/p_viewer_id is null or/i);
  });

  it('filters before the keyset limit and keeps a full page', () => {
    const filter = code.indexOf('private.not_blocked_with(c.author_id, p_viewer_id)');
    const cursor = code.indexOf('p_cursor_at is null');
    const limit = code.indexOf('limit v_limit + 1');
    expect(filter).toBeGreaterThan(-1);
    expect(cursor).toBeGreaterThan(filter);
    expect(limit).toBeGreaterThan(cursor);
    expect(code).toMatch(/order by c\.created_at desc, c\.id desc/i);
  });

  it('restates the public-post test because the function is SECURITY DEFINER', () => {
    expect(code).toMatch(/security definer/i);
    expect(code).toMatch(/set search_path = 'public'/i);
    expect(code).toMatch(/p\.status = 'published'/i);
    expect(code).toMatch(/p\.community_visible = true/i);
    expect(code).toMatch(/p\.deleted_at is null/i);
    expect(code).toMatch(/c\.deleted_at is null/i);
  });

  it('exposes the page only to the service role, not to a client', () => {
    expect(code).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.post_comments_page\s*\(\s*uuid\s*,\s*uuid\s*,\s*timestamptz\s*,\s*uuid\s*,\s*integer\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i
    );
    expect(code).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.post_comments_page\s*\(\s*uuid\s*,\s*uuid\s*,\s*timestamptz\s*,\s*uuid\s*,\s*integer\s*\)\s+to\s+service_role/i
    );
    expect(code).not.toMatch(/grant\s+execute[^\n]*post_comments_page[^\n]*anon/i);
  });

  it('leaves the public total out of the filtered read', () => {
    expect(code).not.toMatch(/count\(\*\)/i);
  });
});
