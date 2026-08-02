import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

const norm = (sql: string) => sql.replace(/\s+/g, ' ').toLowerCase();

describe('RLS enforcement in database migrations', () => {
  it('has at least one migration to audit', () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  for (const file of migrationFiles) {
    it(`${file}: every created table has RLS enabled`, () => {
      const sql = norm(readFileSync(resolve(migrationsDir, file), 'utf8'));
      const createdTables = [...sql.matchAll(/create table (?:if not exists )?([\w."]+)/g)]
        .map((m) => m[1])
        .filter((t): t is string => t !== undefined);

      for (const table of createdTables) {
        const shortName = table.split('.').pop() as string;
        const rlsEnabled = new RegExp(`alter table ${table} enable row level security`).test(sql);
        const rlsEnabledShort = new RegExp(
          `alter table ${shortName} enable row level security`
        ).test(sql);

        expect(
          rlsEnabled || rlsEnabledShort,
          `${file}: table "${table}" is created without "ENABLE ROW LEVEL SECURITY"`
        ).toBe(true);
      }
    });

    it(`${file}: every RLS policy has a USING and/or WITH CHECK clause`, () => {
      const sql = norm(readFileSync(resolve(migrationsDir, file), 'utf8'));
      const policies = [...sql.matchAll(/create policy\s+"([^"]+)"/g)];

      for (const [, policyName] of policies) {
        const start = sql.indexOf(`create policy "${policyName}"`);
        const nextPolicy = sql.indexOf('create policy "', start + 1);
        const blockEnd = nextPolicy === -1 ? sql.length : nextPolicy;
        const policyBlock = sql.slice(start, blockEnd);

        expect(
          /(using\s*\(|with check\s*\()/.test(policyBlock),
          `${file}: policy "${policyName}" must contain a USING and/or WITH CHECK clause`
        ).toBe(true);
      }
    });
  }
});
