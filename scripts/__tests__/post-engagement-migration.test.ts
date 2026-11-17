import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * The likes/comments schema (#1573) is exercised from the API through the
 * service and repository, and every one of those tests mocks the RPCs. Nothing
 * in that stack can notice the migration drifting from what the repository
 * calls: a renamed argument or a missing grant is a `42501` in production that
 * no unit test sees.
 *
 * These assertions read the migration that defines the two tables and the five
 * functions, so a later replacement is still covered. Behaviour against a live
 * database is not reachable here — there is no local stack — so the guard covers
 * what the failure would be: a function the client role can call, a table with
 * no grant, or a write that forgets the tombstone.
 */

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/20261212120000_post_engagement.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ' ');

describe('post engagement migration', () => {
  it('creates the two tables with their keys', () => {
    expect(code).toMatch(/create table if not exists public\.post_likes/i);
    expect(code).toMatch(/create table if not exists public\.post_comments/i);
    // The like is idempotent by its primary key: a repeat is the same row.
    expect(code).toMatch(/primary key \(post_id, user_id\)/i);
  });

  it('tombstones a deleted comment instead of removing the row', () => {
    expect(code).toMatch(/deleted_at timestamptz/i);
    // The thread read and the count both filter the tombstone.
    expect(code).toMatch(/where deleted_at is null/i);
    expect(code).toMatch(/set deleted_at = now\(\)/i);
  });

  it('keeps every write function SECURITY DEFINER, pinned, and service-role only', () => {
    const writes = [
      /public\.post_like\s*\(\s*uuid\s*,\s*uuid\s*,\s*boolean\s*\)/i,
      /public\.post_comment_create\s*\(\s*uuid\s*,\s*uuid\s*,\s*text\s*\)/i,
      /public\.post_comment_update\s*\(\s*uuid\s*,\s*uuid\s*,\s*text\s*\)/i,
      /public\.post_comment_delete\s*\(\s*uuid\s*,\s*uuid\s*\)/i,
    ];

    for (const signature of writes) {
      expect(code, `${signature}: not revoked from the client roles`).toMatch(
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+${signature.source}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
          'i'
        )
      );
      expect(code, `${signature}: not granted to service_role`).toMatch(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+${signature.source}\\s+to\\s+service_role`,
          'i'
        )
      );
    }

    expect(code.match(/security definer/gi)).toHaveLength(5);
    expect(code.match(/set search_path = 'public'/gi)).toHaveLength(5);
  });

  it('lets the counts be read by anyone, because the numbers are public', () => {
    expect(code).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.post_engagement_counts\s*\(\s*uuid\[\]\s*\)\s+to\s+anon\s*,\s*authenticated\s*,\s*service_role/i
    );
  });

  it('refuses a like or a comment on a post a reader could not open', () => {
    // The like write, the comment write, and the comment read policy: all three
    // ask the same four conditions, so a draft or a tombstone has no thread.
    const guards = code.match(
      /status = 'published'\s+and p\.community_visible = true\s+and p\.deleted_at is null/gi
    );
    expect(guards?.length).toBe(3);
  });

  it('grants every new table to the roles it serves', () => {
    expect(code).toMatch(/grant select on public\.post_likes to authenticated/i);
    expect(code).toMatch(/grant all on public\.post_likes to service_role/i);
    expect(code).toMatch(/grant select on public\.post_comments to anon, authenticated/i);
    expect(code).toMatch(/grant all on public\.post_comments to service_role/i);
  });

  it('never writes a like or a comment straight from a client role', () => {
    expect(code).not.toMatch(
      /grant\s+(?:insert|update|delete)\s+on\s+public\.post_(?:likes|comments)/i
    );
  });
});
