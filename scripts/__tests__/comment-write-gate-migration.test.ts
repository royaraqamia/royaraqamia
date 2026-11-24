import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20261229000001_comment_write_gate.sql'
);
const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ' ');

describe('comment write gate migration', () => {
  it('checks a confirmed address and neither direction of a block', () => {
    expect(code).toMatch(/select u\.verified into v_verified/i);
    expect(code).toMatch(/coalesce\(v_verified, false\) = false/i);
    expect(code).toMatch(/return 'unverified'/i);
    expect(code).toMatch(/return 'blocked'/i);
    expect(code).toMatch(/b\.blocker_id = p_author_id and b\.blocked_id = v_post_author_id/i);
    expect(code).toMatch(/b\.blocker_id = v_post_author_id and b\.blocked_id = p_author_id/i);
  });

  it('does not refuse a hidden member whose address is confirmed', () => {
    expect(code).not.toMatch(/is_hidden/i);
  });

  it('makes the write call the same gate and keep its visibility check', () => {
    expect(code).toMatch(/v_gate := public\.post_comment_write_gate\(p_post_id, p_author_id\)/i);
    expect(code).toMatch(/if v_gate <> 'ok' then/i);
    expect(code).toMatch(/p\.status = 'published'/i);
    expect(code).toMatch(/p\.community_visible = true/i);
  });

  it('keeps both functions service-role only', () => {
    for (const name of ['post_comment_write_gate', 'post_comment_create']) {
      expect(code).toMatch(
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\s*\\(\\s*uuid\\s*,\\s*uuid\\s*(?:,\\s*text\\s*)?\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
          'i'
        )
      );
      expect(code).toMatch(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\(\\s*uuid\\s*,\\s*uuid\\s*(?:,\\s*text\\s*)?\\)\\s+to\\s+service_role`,
          'i'
        )
      );
    }
    expect(code).not.toMatch(/grant\s+execute[^\n]*post_comment_write_gate[^\n]*anon/i);
  });
});
