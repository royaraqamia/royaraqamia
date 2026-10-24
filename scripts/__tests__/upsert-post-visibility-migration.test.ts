import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * `public.upsert_post` is the client's only insert path into `public.posts`, and
 * it runs as the caller (`SECURITY INVOKER`). `private.guard_post_server_columns`
 * (20261023140000) refuses a client INSERT whose `community_visible` is not
 * false — and the column defaults to `true` (20260728093805). Because the
 * function's INSERT named neither the column nor a false value, every draft
 * create was answered `42501`, which is what turned
 * `e2e/blogpress-offline.spec.ts` and the BlogPress case in
 * `e2e/product-offline-render.spec.ts` red while nothing in the unit suite
 * touched the function.
 *
 * There is no local Supabase stack, so these assertions read the migration that
 * holds the function's latest definition and guard the two properties the bug
 * violated: the INSERT is explicitly not community-visible, and the conflict
 * branch leaves the `publish`-owned visibility of an existing row alone.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');

const DEFINITION = /create\s+or\s+replace\s+function\s+public\.upsert_post\s*\(/i;

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

    const body =
      /\$function\$([\s\S]*?)\$function\$/.exec(sql)?.[1] ?? /\$\$([\s\S]*?)\$\$/.exec(sql)?.[1];
    expect(body, `${file}: no $function$ body after the definition`).toBeDefined();
    latest = { file, sql, body: body as string };
  }

  expect(latest, 'no migration defines public.upsert_post').toBeDefined();
  return latest as Definition;
}

const latest = latestDefinition();

const insertedColumns = (): string[] => {
  const match =
    /insert\s+into\s+public\.posts\s+as\s+p\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\)\s*on\s+conflict/i.exec(
      latest.body
    );
  expect(match, `${latest.file}: no insert ... values ... on conflict`).not.toBeNull();
  return (match as RegExpExecArray)[1]!
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
};

describe('upsert_post migration', () => {
  it('inserts a draft that the column guard accepts', () => {
    expect(insertedColumns()).toContain('community_visible');

    const values =
      /insert\s+into\s+public\.posts\s+as\s+p\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\)\s*on\s+conflict/i
        .exec(latest.body)?.[2]
        ?.split(',')
        .map((value) => value.trim()) ?? [];
    const visibility = values[insertedColumns().indexOf('community_visible')];
    expect(visibility, `${latest.file}: community_visible is not false`).toBe('false');
  });

  it('leaves the publish-owned visibility of an existing row alone on conflict', () => {
    const update = /on\s+conflict[\s\S]*?do\s+update\s+set([\s\S]*?)\bwhere\b/i.exec(latest.body);
    expect(update, `${latest.file}: no on conflict ... do update set`).not.toBeNull();
    expect((update as RegExpExecArray)[1]).not.toMatch(/\bcommunity_visible\b/i);
  });

  it('stays SECURITY INVOKER with a pinned search_path', () => {
    expect(latest.sql).toMatch(/security\s+invoker/i);
    expect(latest.sql).toMatch(/set\s+search_path\s*=\s*public/i);
  });
});
