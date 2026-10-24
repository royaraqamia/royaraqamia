import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * `public.restore_post` is exercised through the repository, which mocks the RPC,
 * so nothing in the unit suite can catch the function inserting a second row
 * instead of reviving the tombstone (#528). There is no local Supabase stack in
 * CI, so these assertions read the migration that holds the latest definition
 * and guard the properties the bug violated: a restore updates the caller's
 * tombstone, never inserts, and never reads server-owned values from the
 * browser-held snapshot.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');

const DEFINITION =
  /create\s+or\s+replace\s+function\s+public\.restore_post\s*\(\s*p_snapshot\s+jsonb\s*\)/i;

interface Definition {
  file: string;
  sql: string;
  body: string;
}

function latestDefinition(): Definition {
  let latest: Definition | undefined;

  for (const file of migrationFiles) {
    const sql = withoutComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
    const definition = DEFINITION.exec(sql);
    if (!definition) continue;

    const after = sql.slice(definition.index);
    const body =
      /\$function\$([\s\S]*?)\$function\$/.exec(after)?.[1] ??
      /\$\$([\s\S]*?)\$\$/.exec(after)?.[1];
    expect(body, `${file}: no dollar-quoted body after the definition`).toBeDefined();
    latest = { file, sql, body: body as string };
  }

  expect(latest, 'no migration defines public.restore_post').toBeDefined();
  return latest as Definition;
}

const latest = latestDefinition();

describe('restore_post migration', () => {
  it('revives the tombstone instead of inserting a new row', () => {
    expect(latest.body).not.toMatch(/\binsert\s+into\s+(?:public\.)?posts\b/i);
    expect(latest.body).toMatch(/\bupdate\s+public\.posts\b/i);
    expect(latest.body).toMatch(/\bdeleted_at\s*=\s*null\b/i);
  });

  it('scopes the lookup to the caller and only a tombstone', () => {
    expect(latest.body).toMatch(/p\.author_id\s*=\s*v_author/i);
    expect(latest.body).toMatch(/p\.deleted_at\s+is\s+not\s+null/i);
    expect(latest.body).toMatch(/p_snapshot\s*->>\s*'id'/i);
    expect(latest.body).toMatch(/p_snapshot\s*->>\s*'slug'/i);
  });

  it('refuses a snapshot with no matching tombstone and writes nothing', () => {
    expect(latest.body).toMatch(/raise\s+exception\s+'deleted post not found'/i);
    expect(latest.body).toMatch(/errcode\s*=\s*'P0002'/i);
  });

  it('takes no server-owned column from the snapshot', () => {
    expect(latest.body).not.toMatch(
      /p_snapshot\s*->>\s*'(?:status|published_at|publish_at|view_count|featured|community_visible|reading_time_minutes)'/i
    );
  });

  it('stays SECURITY DEFINER with a pinned search_path, reachable by clients', () => {
    expect(latest.sql).toMatch(/security\s+definer/i);
    expect(latest.sql).toMatch(/set\s+search_path\s*=\s*'public'/i);
    expect(latest.sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.restore_post\s*\(\s*jsonb\s*\)\s+from\s+public\s*,\s*anon/i
    );
    expect(latest.sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.restore_post\s*\(\s*jsonb\s*\)\s+to\s+authenticated\s*,\s*service_role/i
    );
  });
});
