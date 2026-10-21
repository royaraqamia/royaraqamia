import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * `public.increment_post_view_count` is exercised from the public view route through
 * `CommunityViewRecorder`, and the repository test mocks the RPC, so nothing caught the
 * function still toggling a trigger that `20261012140354_blogpress_offline_drafts.sql`
 * had dropped: every call raised `42704` and every view answered 500 (#459).
 *
 * These assertions read the migration that holds the function's latest definition, so a
 * future replacement is covered too. Behaviour against a live database is not reachable
 * here - there is no local stack (`supabase/config.toml` does not exist) and CI does not
 * run `supabase test db` - so the guard covers what the failure actually was: a
 * definition that asks for DDL the schema no longer has.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');

const DEFINITION =
  /create\s+or\s+replace\s+function\s+public\.increment_post_view_count\s*\(\s*p_post_id\s+uuid\s*\)/i;

interface Definition {
  file: string;
  sql: string;
  body: string;
}

/** The migration that last (re)defines the function, with its body. */
function latestDefinition(): Definition {
  let latest: Definition | undefined;

  for (const file of migrationFiles) {
    const sql = withoutComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
    if (!DEFINITION.test(sql)) continue;

    const body = /\$function\$([\s\S]*?)\$function\$/.exec(sql)?.[1];
    expect(body, `${file}: no $function$ body after the definition`).toBeDefined();
    latest = { file, sql, body: body as string };
  }

  expect(latest, 'no migration defines public.increment_post_view_count').toBeDefined();
  return latest as Definition;
}

const latest = latestDefinition();

describe('increment_post_view_count migration', () => {
  it('takes a single view out of the DDL the dropped trigger needed', () => {
    expect(latest.body).not.toMatch(/\balter\s+table\b/i);
    expect(latest.body).not.toMatch(/\b(?:disable|enable)\s+trigger\b/i);
  });

  it('increments once, for a published post or a scheduled one whose time has come', () => {
    const increments = [
      ...latest.body.matchAll(
        /update\s+posts\s+set\s+view_count\s*=\s*view_count\s*\+\s*1\s+where\s+id\s*=\s*p_post_id/gi
      ),
    ];
    expect(increments).toHaveLength(1);

    expect(latest.body).toMatch(
      /status\s*=\s*'published'\s+or\s+\(\s*status\s*=\s*'scheduled'\s+and\s+publish_at\s*<=\s*now\(\)\s*\)/i
    );
  });

  it('stays SECURITY DEFINER with a pinned search_path', () => {
    expect(latest.sql).toMatch(/security\s+definer/i);
    expect(latest.sql).toMatch(/set\s+search_path\s*=\s*'public'/i);
  });

  it('stays service-role only', () => {
    expect(latest.sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.increment_post_view_count\s*\(\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i
    );
    expect(latest.sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.increment_post_view_count\s*\(\s*uuid\s*\)\s+to\s+service_role/i
    );
  });
});

describe('posts updated_at trigger', () => {
  it('is never recreated: the client owns the logical write time', () => {
    for (const file of migrationFiles) {
      const sql = withoutComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
      expect(
        sql,
        `${file}: recreates update_posts_updated_at, which ADR-0029/ADR-0033 dropped`
      ).not.toMatch(
        /create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+update_posts_updated_at/i
      );
    }
  });
});
