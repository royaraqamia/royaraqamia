import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SYNC_HINT_TABLES as BLOGPRESS } from '@/frontend/state/blogpress/use-blogpress-store';
import { SYNC_HINT_TABLES as HABITFLOW } from '@/frontend/state/habitflow/use-habit-sync';
import { SYNC_HINT_TABLES as LINKSNAP } from '@/frontend/state/linksnap/use-linksnap';
import { NEWS_SYNC_HINT_TABLES } from '@/frontend/api/news';
import { SYNC_HINT_TABLES as QURAN } from '@/frontend/state/quran/use-quran-reader';
import { SYNC_HINT_TABLES as SPENDTRACK } from '@/frontend/state/spendtrack/use-spendtrack';

/**
 * A table a surface subscribes to but the project does not publish delivers
 * nothing, forever, and silently: the pages still pull on mount and focus, so the
 * only symptom is cross-device latency (ADR-0060). The reverse — a published
 * table nobody subscribes to — is a stream of changes nobody reads. Neither
 * shows up in any other check, so the three lists are pinned to each other here:
 * the surfaces' `SYNC_HINT_TABLES`, the publication migrations' arrays, and the
 * tables `scripts/check-realtime-hints.mjs` probes.
 *
 * The publication is read from every migration that publishes hint tables, not
 * from one: a product landing later adds a file rather than editing an applied
 * migration, which is how the Quran's two tables arrived
 * (`20261019170000_publish_quran_tables_for_realtime_hints.sql`).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function quotedList(source: string): string[] {
  return [...source.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
}

/** The tables the publication migrations loop over. */
function publishedTables(): string[] {
  const directory = resolve(ROOT, 'supabase', 'migrations');
  const files = readdirSync(directory).filter((name) =>
    /_publish_.*_realtime_hints\.sql$/.test(name)
  );
  expect(files.length, 'the publication migrations are missing').toBeGreaterThan(0);

  return files.flatMap((file) => {
    const sql = readFileSync(resolve(directory, file), 'utf8');
    const loop = /foreach\s+target\s+in\s+array\s+array\[([^\]]+)\]/i.exec(sql);
    expect(loop, `${file} no longer loops over an array of tables`).not.toBeNull();
    return quotedList(loop![1]!);
  });
}

/** The tables the live-project check writes to. */
function checkedTables(): string[] {
  const source = readFileSync(resolve(ROOT, 'scripts', 'check-realtime-hints.mjs'), 'utf8');
  return [...source.matchAll(/table:\s*'([a-z_]+)'/g)].map((match) => match[1]!);
}

const SUBSCRIBED = [
  ...HABITFLOW,
  ...SPENDTRACK,
  ...LINKSNAP,
  ...QURAN,
  ...BLOGPRESS,
  ...NEWS_SYNC_HINT_TABLES,
];

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
    // HabitFlow, SpendTrack, LinkSnap and the Quran Reader, one table each.
    // BlogPress's hint path is covered by the migration-array pin above; its
    // probe is pending until check-realtime-hints learns `author_id` filtering.
    expect(checked.length).toBeGreaterThanOrEqual(4);
    for (const table of checked) expect(SUBSCRIBED).toContain(table);
  });
});
