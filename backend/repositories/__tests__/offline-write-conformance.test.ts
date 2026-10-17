import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * The offline-owned repositories (ADR-0029). Each replays Outbox writes, so
 * every one must hold three invariants — the classes of bug that shipped in
 * SpendTrack and were found in HabitFlow/LinkSnap:
 *
 *   1. Last-write-wins on `updated_at`, so an out-of-order replay (a stale
 *      edit/undo retried after a newer delete) cannot invert newer state.
 *   2. No camelCase domain field spread into a DB update payload: PostgREST
 *      rejects unknown columns (PGRST204) and the sync engine then marks the
 *      write a permanent failure.
 *   3. Creates upsert on `(user_id, client_id)` — directly, or through the
 *      `upsert_*_lww` SQL function that applies the same key with a
 *      last-write-wins conflict predicate — so a replayed write is idempotent
 *      instead of a duplicate and cannot discard a newer edit (#287).
 *
 * This is a source tripwire, not a proof. Adding a product means appending its
 * repository below so it gets the same guardrails.
 */
const OFFLINE_REPOSITORIES = [
  'backend/repositories/spendtrack/index.ts',
  'backend/repositories/habitflow/supabase-repository.ts',
  'backend/repositories/linksnap/supabase-short-link.ts',
  'backend/repositories/blogpress/posts.ts',
];

/**
 * camelCase keys that are domain fields, never DB columns. Matches them as an
 * object *key* (`clientId:`) so a legitimate value (`{ client_id: clientId }`)
 * is not flagged.
 */
const CAMEL_CASE_UPDATE_KEYS =
  /\b(clientId|updatedAt|deletedAt|originalUrl|expiresAt|passwordHash|colorHex)\s*:/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('offline write conformance (ADR-0029)', () => {
  it('lists repositories that exist', () => {
    for (const file of OFFLINE_REPOSITORIES) {
      expect(existsSync(resolve(process.cwd(), file)), file).toBe(true);
    }
  });

  it('every offline repository applies last-write-wins on updated_at', () => {
    for (const file of OFFLINE_REPOSITORIES) {
      expect(read(file), file).toMatch(/lte\(\s*'updated_at'/);
    }
  });

  it('no repository spreads a camelCase field into an update payload literal', () => {
    for (const file of OFFLINE_REPOSITORIES) {
      const source = stripComments(read(file));
      for (const match of source.matchAll(/\.update\(\s*\{([^}]*)\}/g)) {
        expect(match[1], `${file}: ${match[0].slice(0, 80)}`).not.toMatch(CAMEL_CASE_UPDATE_KEYS);
      }
    }
  });

  it('every client-id-bearing create upserts idempotently', () => {
    for (const file of OFFLINE_REPOSITORIES) {
      const source = read(file);
      if (!/clientId|client_id/.test(source)) continue;
      // BlogPress posts key ownership on `author_id` and let the client mint the
      // primary key, so they upsert on `id`; the others on `(user_id, client_id)`
      // — via the plain PostgREST upsert or the last-write-wins SQL function.
      expect(source, file).toMatch(
        /onConflict:\s*'(?:user_id,client_id|author_id,client_id|id)'|rpc\(\s*'upsert_\w+_lww'/
      );
    }
  });
});
