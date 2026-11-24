import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20261230000000_comment_host_removal.sql'
);
const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ' ');

describe('comment host removal migration', () => {
  it('records who removed a comment and why', () => {
    expect(code).toMatch(/add column if not exists deleted_by uuid/i);
    expect(code).toMatch(/add column if not exists deleted_reason text/i);
    expect(code).toMatch(/deleted_by = p_actor_id/i);
    expect(code).toMatch(/'post_author'/i);
  });

  it('lets the writer or the post author tombstone, and nobody else', () => {
    expect(code).toMatch(/c\.author_id = p_actor_id/i);
    expect(code).toMatch(/p\.author_id = p_actor_id/i);
    expect(code).toMatch(/c\.deleted_at is null/i);
  });

  it('drops the old signature before renaming the input parameter', () => {
    const drop = code.indexOf('drop function if exists public.post_comment_delete(uuid, uuid)');
    const create = code.indexOf('create or replace function public.post_comment_delete(');
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(drop);
  });

  it('never edits the body or the writer’s edited stamp', () => {
    expect(code).not.toMatch(/set body/i);
    expect(code).not.toMatch(/edited_at\s*=/i);
  });

  it('keeps the delete function service-role only', () => {
    expect(code).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.post_comment_delete\s*\(\s*uuid\s*,\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i
    );
    expect(code).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.post_comment_delete\s*\(\s*uuid\s*,\s*uuid\s*\)\s+to\s+service_role/i
    );
  });
});
