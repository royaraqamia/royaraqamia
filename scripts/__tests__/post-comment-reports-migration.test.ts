import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20261231000000_post_comment_reports.sql'
);
const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ' ');

describe('comment reports migration', () => {
  it('deduplicates per reporter and comment and keeps the three states', () => {
    expect(code).toMatch(/unique \(reporter_id, comment_id\)/i);
    expect(code).toMatch(/status in \('open', 'reviewed', 'dismissed'\)/i);
    expect(code).toMatch(/reason in \('spam', 'abuse', 'other'\)/i);
  });

  it('builds the snapshot from the database rows, never from a client field', () => {
    expect(code).toMatch(/jsonb_build_object\(/i);
    expect(code).toMatch(/'body', v_row\.body/i);
    expect(code).toMatch(/'authorId', v_row\.author_id/i);
    expect(code).toMatch(/on conflict \(reporter_id, comment_id\) do nothing/i);
  });

  it('never lets a client write a report or change its status', () => {
    expect(code).not.toMatch(
      /grant\s+(?:insert|update|delete)\s+on\s+public\.post_comment_reports/i
    );
    for (const name of ['post_comment_report', 'post_comment_reports_decide']) {
      expect(code).toMatch(
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\b[\\s\\S]{0,160}from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
          'i'
        )
      );
    }
  });

  it('lets a member read only their own reports', () => {
    expect(code).toMatch(/using \(reporter_id = \(select auth\.uid\(\)\)\)/i);
    expect(code).toMatch(/grant select on public\.post_comment_reports to authenticated/i);
  });
});
