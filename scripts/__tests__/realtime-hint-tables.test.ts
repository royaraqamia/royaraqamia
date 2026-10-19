import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SYNC_HINT_TABLES as HABITFLOW } from '@/frontend/state/habitflow/use-habit-sync';
import { SYNC_HINT_TABLES as LINKSNAP } from '@/frontend/state/linksnap/use-linksnap';
import { SYNC_HINT_TABLES as SPENDTRACK } from '@/frontend/state/spendtrack/use-spendtrack';

/**
 * A table a surface subscribes to but the project does not publish delivers
 * nothing, forever, and silently: the pages still pull on mount and focus, so the
 * only symptom is cross-device latency (ADR-0060). The reverse — a published
 * table nobody subscribes to — is a stream of changes nobody reads. Neither
 * shows up in any other check, so the three lists are pinned to each other here:
 * the surfaces' `SYNC_HINT_TABLES`, the publication migration's array, and the
 * tables `scripts/check-realtime-hints.mjs` probes.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function quotedList(source: string): string[] {
  return [...source.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
}

/** The tables the publication migration loops over. */
function publishedTables(): string[] {
  const directory = resolve(ROOT, 'supabase', 'migrations');
  const file = readdirSync(directory).find((name) =>
    name.endsWith('_publish_owned_tables_for_realtime_hints.sql')
  );
  expect(file, 'the publication migration is missing').toBeDefined();

  const sql = readFileSync(resolve(directory, file!), 'utf8');
  const loop = /foreach\s+target\s+in\s+array\s+array\[([^\]]+)\]/i.exec(sql);
  expect(loop, 'the migration no longer loops over an array of tables').not.toBeNull();
  return quotedList(loop![1]!);
}

/** The tables the live-project check writes to. */
function checkedTables(): string[] {
  const source = readFileSync(resolve(ROOT, 'scripts', 'check-realtime-hints.mjs'), 'utf8');
  return [...source.matchAll(/table:\s*'([a-z_]+)'/g)].map((match) => match[1]!);
}

const SUBSCRIBED = [...HABITFLOW, ...SPENDTRACK, ...LINKSNAP];

describe('Realtime sync hint tables', () => {
  it('subscribes to every table the publication migration publishes, and no other', () => {
    expect([...SUBSCRIBED].sort()).toEqual(publishedTables().sort());
  });

  it('publishes every table the surfaces subscribe to, without duplicates', () => {
    expect(new Set(SUBSCRIBED).size).toBe(SUBSCRIBED.length);
    expect(publishedTables()).toEqual(expect.arrayContaining(SUBSCRIBED));
  });

  it('checks a table of every subscribed product against the live project', () => {
    const checked = checkedTables();
    expect(checked.length).toBeGreaterThanOrEqual(3);
    for (const table of checked) expect(SUBSCRIBED).toContain(table);
  });
});
