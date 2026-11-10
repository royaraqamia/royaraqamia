import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The attachment caps sum `public.chat_attachments.byte_size`, and that column
 * used to be whatever the request body said: a one-byte declaration for a 10 MB
 * object spent the project's storage while the composer's meter read almost
 * nothing (#1077). The trigger now takes the number from `storage.objects`,
 * where Storage recorded it on upload.
 *
 * Behaviour against a live database is asserted in
 * `supabase/tests/chat_attachment_allowances_test.sql` (`supabase test db`,
 * local stack only — CI does not run it). These assertions are the CI-visible
 * half: the newest definition of the trigger must keep reading the stored size
 * and writing it over the declared one, because a future replacement that drops
 * it restores the hole silently.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');

const DEFINITION =
  /create\s+or\s+replace\s+function\s+private\.enforce_chat_attachment_quota\s*\(\s*\)/i;

interface Definition {
  file: string;
  sql: string;
  body: string;
}

/** The migration that last (re)defines the trigger's function, with its body. */
function latestDefinition(): Definition {
  let latest: Definition | undefined;

  for (const file of migrationFiles) {
    const sql = withoutComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
    if (!DEFINITION.test(sql)) continue;

    const body = /\$\$([\s\S]*?)\$\$/.exec(sql)?.[1];
    expect(body, `${file}: no $$ body after the definition`).toBeDefined();
    latest = { file, sql, body: body as string };
  }

  expect(latest, 'no migration defines private.enforce_chat_attachment_quota').toBeDefined();
  return latest as Definition;
}

const latest = latestDefinition();

/** Where a pattern first appears, or -1. Ordering is what makes a claim honest. */
const at = (pattern: RegExp) => latest.body.search(pattern);

describe('private.enforce_chat_attachment_quota', () => {
  it('measures the object Storage holds, not the number the caller sent', () => {
    expect(latest.body).toMatch(/storage\.objects/i);
    expect(latest.body).toMatch(/metadata\s*->>\s*'size'/i);
    expect(latest.body).toMatch(/new\.byte_size\s*:=\s*v_stored/i);
  });

  it('takes the stored size before it compares any cap', () => {
    const measured = at(/new\.byte_size\s*:=\s*v_stored/i);
    const firstCap = at(/raise\s+exception\s+'chat attachment file is too large'/i);

    expect(measured).toBeGreaterThan(-1);
    expect(firstCap).toBeGreaterThan(measured);
  });

  it('refuses an object it cannot measure instead of storing an unmeasured row', () => {
    expect(latest.body).toMatch(
      /if\s+v_stored\s+is\s+null\s+then\s+raise\s+exception\s+'chat attachment size is unknown'\s+using\s+errcode\s*=\s*'53400'/i
    );
  });

  it('still answers the four caps, on the stored number', () => {
    for (const sentence of [
      'chat attachment file is too large',
      'chat attachment daily allowance reached',
      'chat attachment storage is full',
      'chat attachment project storage is full',
    ]) {
      expect(latest.body).toContain(sentence);
    }

    expect(latest.body).not.toMatch(/new\.byte_size\s*(?:<>|!=)/);
  });

  it('stays SECURITY DEFINER with a pinned search_path', () => {
    expect(latest.sql).toMatch(/security\s+definer/i);
    expect(latest.sql).toMatch(/set\s+search_path\s*=\s*'public'/i);
  });

  it('stays closed to every client role', () => {
    expect(latest.sql).toMatch(
      /revoke\s+all\s+on\s+function\s+private\.enforce_chat_attachment_quota\s*\(\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i
    );
  });
});
