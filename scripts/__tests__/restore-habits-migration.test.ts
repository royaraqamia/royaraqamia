import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * `public.restore_habits` is exercised through the repository, which mocks the
 * RPC, so the unit suite cannot prove that the clear and the inserts are one
 * transaction or that a local-mode `h-*` habit keeps its logs (#550). There is no
 * local Supabase stack in CI, so these assertions read the migration that holds
 * the definition and guard the properties the bug violated: the owner comes from
 * `auth.uid()`, the clear and both inserts are in one function body, and logs use
 * the id the habit insert minted.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');

const DEFINITION =
  /create\s+or\s+replace\s+function\s+public\.restore_habits\s*\(\s*p_backup\s+jsonb\s*\)/i;

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

  expect(latest, 'no migration defines public.restore_habits').toBeDefined();
  return latest as Definition;
}

const latest = latestDefinition();

describe('restore_habits migration', () => {
  it('clears and re-inserts habits and logs in the same transaction body', () => {
    expect(latest.body).toMatch(
      /delete\s+from\s+public\.habit_logs\s+where\s+user_id\s*=\s*v_owner/i
    );
    expect(latest.body).toMatch(/delete\s+from\s+public\.habits\s+where\s+user_id\s*=\s*v_owner/i);
    expect(latest.body).toMatch(/insert\s+into\s+public\.habits\b/i);
    expect(latest.body).toMatch(/insert\s+into\s+public\.habit_logs\b/i);
  });

  it('resolves the owner from auth.uid(), never from the payload', () => {
    expect(latest.body).toMatch(/v_owner\s+uuid\s*:=\s*auth\.uid\(\)/i);
    expect(latest.body).not.toMatch(/p_backup\s*->>\s*'user_id'/i);
  });

  it('remaps a non-UUID habit id and inserts logs against the mapped id', () => {
    expect(latest.body).toMatch(/gen_random_uuid\(\)/i);
    expect(latest.body).toMatch(/v_old_id\s*~\*\s*'\^\[0-9a-f\]/i);
    expect(latest.body).toMatch(/v_map\s*:=\s*v_map\s*\|\|\s*jsonb_build_object\(v_old_id/i);
    expect(latest.body).toMatch(/v_new_id\s*:=\s*nullif\(v_map\s*->>\s*v_old_id/i);
    expect(latest.body).toMatch(/insert\s+into\s+public\.habit_logs[\s\S]*?v_new_id/i);
  });

  it('fails a log that names a habit outside the backup', () => {
    expect(latest.body).toMatch(/if\s+v_new_id\s+is\s+null\s+then/i);
    expect(latest.body).toMatch(/raise\s+exception[\s\S]*?errcode\s*=\s*'23503'/i);
  });

  it('stays SECURITY DEFINER with a pinned search_path and client grants', () => {
    expect(latest.sql).toMatch(/security\s+definer/i);
    expect(latest.sql).toMatch(/set\s+search_path\s*=\s*'public'/i);
    expect(latest.sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.restore_habits\s*\(\s*jsonb\s*\)\s+from\s+public\s*,\s*anon/i
    );
    expect(latest.sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.restore_habits\s*\(\s*jsonb\s*\)\s+to\s+authenticated\s*,\s*service_role/i
    );
  });
});
