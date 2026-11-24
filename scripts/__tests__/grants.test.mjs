import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  applyPendingChanges,
  buildBaseline,
  compare,
  fetchGrants,
  main,
  normalizeRows,
  pendingChanges,
  serializeBaseline,
} from '../check-grants.mjs';

const tempDirs = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const collect = () => {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)) };
};

const rows = [
  { relation: 'notes', grantee: 'anon', privileges: ['SELECT'] },
  {
    relation: 'notes',
    grantee: 'authenticated',
    privileges: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  },
  { relation: 'users', grantee: 'authenticated', privileges: ['SELECT'] },
];
const jsonResponse = (payload) => ({
  ok: true,
  status: 201,
  statusText: 'Created',
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

describe('normalizeRows', () => {
  it('accepts the read-only endpoint array and its data envelope', () => {
    expect(normalizeRows(rows)).toEqual(normalizeRows({ data: rows }));
  });

  it('drops other roles and empty privilege lists', () => {
    const normalized = normalizeRows([
      ...rows,
      { relation: 'notes', grantee: 'service_role', privileges: ['SELECT'] },
      { relation: 'notes', grantee: 'anon', privileges: [] },
    ]);
    expect(normalized).toEqual(rows);
  });
});

describe('buildBaseline', () => {
  it('records both roles for every relation, sorted', () => {
    const baseline = buildBaseline(rows);
    expect(Object.keys(baseline.relations)).toEqual(['notes', 'users']);
    expect(baseline.relations.notes).toEqual({
      anon: ['SELECT'],
      authenticated: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
    });
    expect(baseline.relations.users.anon).toEqual([]);
  });

  it('serializes in the Prettier-stable shape, with arrays on one line', () => {
    expect(serializeBaseline(buildBaseline(rows))).toContain(
      '"authenticated": ["DELETE", "INSERT", "SELECT", "UPDATE"]'
    );
  });
});

describe('pendingChanges', () => {
  it('reads table and view GRANT/REVOKEs but not functions or default privileges', () => {
    const dir = tempDir('grants-sql-');
    const file = join(dir, '20270102000000_revoke.sql');
    writeFileSync(
      file,
      `-- rollback: revoke insert on public.notes from anon;
       revoke insert, update, delete on public.notes, public.following_feed from anon;
       revoke truncate, references, trigger on public.following_feed from anon, authenticated;
       revoke execute on function private.helper() from public;
       alter default privileges for role postgres in schema public revoke all on tables from anon;`
    );
    const changes = pendingChanges([file]);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      kind: 'revoke',
      privileges: ['INSERT', 'UPDATE', 'DELETE'],
      relations: ['notes', 'following_feed'],
      roles: ['anon'],
    });
    expect(changes[1]).toMatchObject({
      kind: 'revoke',
      privileges: ['TRUNCATE', 'REFERENCES', 'TRIGGER'],
      relations: ['following_feed'],
      roles: ['anon', 'authenticated'],
    });
  });

  it('reads a pending GRANT too, so a widening is caught before the merge', () => {
    const changes = pendingChangesFrom(`grant insert on table public.users to anon;`);
    expect(changes[0]).toMatchObject({
      kind: 'grant',
      privileges: ['INSERT'],
      relations: ['users'],
      roles: ['anon'],
    });
  });
});

describe('applyPendingChanges', () => {
  it('simulates a pending revoke without touching other roles', () => {
    const revoked = pendingChangesFrom(`revoke insert, update, delete on public.notes from anon;`);
    expect(applyPendingChanges(rows, revoked)).toEqual([
      { relation: 'notes', grantee: 'anon', privileges: ['SELECT'] },
      {
        relation: 'notes',
        grantee: 'authenticated',
        privileges: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
      },
      { relation: 'users', grantee: 'authenticated', privileges: ['SELECT'] },
    ]);
  });
});

function pendingChangesFrom(sql) {
  const dir = tempDir('grants-changes-');
  const file = join(dir, '20270102000000_x.sql');
  writeFileSync(file, sql);
  return pendingChanges([file]);
}

describe('compare', () => {
  const baseline = buildBaseline(rows);

  it('passes on a matching ACL', () => {
    expect(compare(baseline, rows)).toEqual([]);
  });

  it('fails on an unbaselined grant', () => {
    const live = [
      ...rows.filter((row) => !(row.relation === 'notes' && row.grantee === 'anon')),
      { relation: 'notes', grantee: 'anon', privileges: ['SELECT', 'INSERT'] },
    ];
    expect(compare(baseline, live).join('\n')).toContain('unbaselined anon grant INSERT');
  });

  it('fails when a baseline row is missing from the database', () => {
    expect(
      compare(
        baseline,
        rows.filter((row) => row.relation !== 'users')
      ).join('\n')
    ).toContain('baseline row is missing from the database');
  });

  it('fails when the baseline itself records a forbidden privilege', () => {
    const staleRows = [
      ...rows.filter((row) => !(row.relation === 'notes' && row.grantee === 'anon')),
      { relation: 'notes', grantee: 'anon', privileges: ['SELECT', 'DELETE'] },
    ];
    expect(compare(buildBaseline(staleRows), staleRows).join('\n')).toContain('docs/security.md');
  });
});

describe('fetchGrants', () => {
  it('POSTs the read-only query with the management token', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(rows);
    };
    const result = await fetchGrants({
      token: 'sbp_test',
      projectRef: 'abcdefghijklmnop',
      fetchImpl,
    });
    expect(result).toEqual(rows);
    expect(calls[0].url).toBe(
      'https://api.supabase.com/v1/projects/abcdefghijklmnop/database/query/read-only'
    );
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sbp_test');
    expect(JSON.parse(calls[0].init.body).query).toContain('pg_catalog.aclexplode');
  });
});

describe('main', () => {
  it('generates a baseline from a snapshot including pending REVOKEs, then passes a check', async () => {
    const dir = tempDir('grants-main-');
    const baselinePath = join(dir, 'grant-baseline.json');
    const snapshot = join(dir, 'snapshot.json');
    const migrations = join(dir, 'migrations');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(migrations);
    writeFileSync(
      join(migrations, '20270102000000_revoke.sql'),
      'revoke insert, update, delete on public.notes from anon;'
    );
    writeFileSync(
      snapshot,
      JSON.stringify({
        versions: ['20270102000000'],
        grants: [
          ...rows.filter((row) => !(row.relation === 'notes' && row.grantee === 'anon')),
          {
            relation: 'notes',
            grantee: 'anon',
            privileges: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
          },
        ],
      })
    );
    const first = collect();
    expect(
      await main(['--from', snapshot, '--generate'], {
        dir: migrations,
        baselinePath,
        log: first.log,
      })
    ).toBe(0);
    expect(JSON.parse(readFileSync(baselinePath, 'utf8')).relations.notes.anon).toEqual(['SELECT']);

    const second = collect();
    expect(
      await main(['--from', snapshot], { dir: migrations, baselinePath, log: second.log })
    ).toBe(0);
    expect(second.lines.join('\n')).toContain('1 pending migration(s) simulated');
  });

  it('fails when a grant is outside the baseline', async () => {
    const dir = tempDir('grants-fail-');
    const baselinePath = join(dir, 'grant-baseline.json');
    const snapshot = join(dir, 'snapshot.json');
    writeFileSync(baselinePath, JSON.stringify(buildBaseline(rows)));
    writeFileSync(
      snapshot,
      JSON.stringify({
        versions: [],
        grants: [
          ...rows.filter((row) => !(row.relation === 'notes' && row.grantee === 'anon')),
          { relation: 'notes', grantee: 'anon', privileges: ['SELECT', 'INSERT'] },
        ],
      })
    );
    const output = collect();
    expect(await main(['--from', snapshot], { baselinePath, log: output.log })).toBe(1);
    expect(output.lines.join('\n')).toContain('unbaselined anon grant INSERT');
  });

  it('fails on a grant a pending migration has not applied yet', async () => {
    const dir = tempDir('grants-pending-grant-');
    const baselinePath = join(dir, 'grant-baseline.json');
    const snapshot = join(dir, 'snapshot.json');
    const migrations = join(dir, 'migrations');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(migrations);
    writeFileSync(
      join(migrations, '20270103000000_widen.sql'),
      'grant insert on public.notes to anon;'
    );
    writeFileSync(baselinePath, JSON.stringify(buildBaseline(rows)));
    writeFileSync(snapshot, JSON.stringify({ versions: ['20270103000000'], grants: rows }));
    const output = collect();
    expect(
      await main(['--from', snapshot], { dir: migrations, baselinePath, log: output.log })
    ).toBe(1);
    expect(output.lines.join('\n')).toContain('unbaselined anon grant INSERT');
  });

  it('skips without credentials instead of pretending to have checked', async () => {
    const output = collect();
    expect(await main([], { env: {}, log: output.log })).toBe(0);
    expect(output.lines.join('\n')).toContain('Skipping');
  });
});
