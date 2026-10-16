import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const FUNCTION = 'public.sweep_expired_mcp_oauth_auth_codes';

/**
 * The authorization-code sweep runs in the database, not in the app — pg_cron
 * calls the SECURITY DEFINER function directly — so the SQL is the production
 * code path. These read the latest definition of it out of the migration history
 * (a later `create or replace` wins, as on the project) and pin the shape the
 * client roles depend on.
 */
function latestSweepSql(): string {
  let sql = '';
  for (const file of readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    const content = readFileSync(resolve(migrationsDir, file), 'utf8');
    if (content.includes(FUNCTION)) sql = content.replace(/\s+/g, ' ').toLowerCase();
  }
  return sql;
}

/** Just the function body, so the prose above it cannot satisfy an assertion. */
function functionBody(sql: string): string {
  const start = sql.indexOf(`create or replace function ${FUNCTION}`);
  const end = sql.indexOf('$fn$;', start);
  return end === -1 ? '' : sql.slice(start, end + '$fn$;'.length);
}

describe('the MCP OAuth authorization-code sweep', () => {
  const sql = latestSweepSql();
  const body = functionBody(sql);

  it('is defined in the migration history', () => {
    expect(body).not.toBe('');
  });

  it('deletes claimed and expired codes, and nothing else', () => {
    // Claimed means the exchange already copied the ciphertext into the token
    // pair; expired means it can no longer be exchanged. Both are dead rows.
    expect(body).toContain(
      'delete from public.mcp_oauth_auth_codes where used_at is not null or expires_at < now();'
    );
  });

  it('is a search-path-pinned security definer', () => {
    expect(body).toContain('security definer');
    expect(body).toContain("set search_path = 'public'");
  });

  it('stays unreachable by the client roles', () => {
    expect(sql).toContain(
      `revoke execute on function ${FUNCTION}() from public, anon, authenticated;`
    );
  });

  it('is scheduled daily', () => {
    expect(sql).toMatch(/cron\.schedule\( ?'mcp-oauth-auth-codes-sweep'/);
  });
});
