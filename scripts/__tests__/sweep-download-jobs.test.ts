import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const FUNCTION = 'public.sweep_download_jobs';

/**
 * `sweep_download_jobs` runs in the database, not in the app — pg_cron calls the
 * SECURITY DEFINER function directly — so the SQL is the production code path.
 * These read the latest definition out of the migration history (a later
 * `create or replace` wins, as on the project) and pin the two thresholds the
 * reconciliation depends on.
 */
function latestSweepSql(): string {
  let sql = '';
  for (const file of readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    const content = readFileSync(resolve(migrationsDir, file), 'utf8');
    if (content.includes('create or replace function ' + FUNCTION)) {
      sql = content.replace(/\s+/g, ' ').toLowerCase();
    }
  }
  return sql;
}

/** Just the function body, so the prose above it cannot satisfy an assertion. */
function functionBody(sql: string): string {
  const start = sql.indexOf(`create or replace function ${FUNCTION}`);
  const end = sql.indexOf('$fn$;', start);
  return end === -1 ? '' : sql.slice(start, end + '$fn$;'.length);
}

describe('the Download Job sweep', () => {
  const sql = latestSweepSql();
  const body = functionBody(sql);

  it('is defined in the migration history', () => {
    expect(body).not.toBe('');
  });

  it('reconciles queued jobs on a short deadline', () => {
    // `dispatch` is scheduled straight after the response, so a queued row past
    // the deadline was never handed to the provider and never will be.
    expect(body).toContain("queued_deadline constant interval := interval '2 minutes'");
    expect(body).toContain("status = 'queued' and updated_at < now() - queued_deadline");
  });

  it('sizes the running deadline from the live duration cap, not a literal', () => {
    expect(body).toContain('select max_duration_seconds from public.downloader_settings');
    expect(body).toContain('default_duration_cap_seconds constant int := 900');
    expect(body).toContain("processing_buffer constant interval := interval '15 minutes'");
    expect(body).toContain('make_interval(secs => duration_cap_seconds) + processing_buffer');
    // The literal 15-minute `running` threshold is what swept healthy jobs.
    expect(body).not.toContain("status = 'running' and updated_at < now() - interval");
    expect(body).toContain("status = 'running' and updated_at < now() - running_deadline");
  });

  it('floors the running deadline so a lowered cap cannot sweep mid-flight work', () => {
    expect(body).toContain("min_running_deadline constant interval := interval '15 minutes'");
    expect(body).toContain('greatest(');
    expect(body).toContain('min_running_deadline,');
  });

  it('records an event for every swept job', () => {
    expect(body).toContain('returning id');
    expect(body).toContain('insert into public.download_job_events (job_id, status)');
    expect(body).toContain("select id, 'failed' from stale");
  });

  it('only ever moves a job to failed', () => {
    const statuses = new Set([...body.matchAll(/status = '([^']+)'/g)].map((match) => match[1]));
    expect(statuses).toEqual(new Set(['failed', 'queued', 'running']));
  });

  it('leaves retention alone', () => {
    expect(body).toContain(
      "delete from public.download_jobs where created_at < now() - interval '24 hours';"
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

  it('keeps its cron schedule', () => {
    const scheduled = readdirSync(migrationsDir)
      .filter((entry) => entry.endsWith('.sql'))
      .some((entry) =>
        /cron\.schedule\(\s*'download-jobs-sweep'/.test(
          readFileSync(resolve(migrationsDir, entry), 'utf8')
        )
      );
    expect(scheduled).toBe(true);
  });
});
