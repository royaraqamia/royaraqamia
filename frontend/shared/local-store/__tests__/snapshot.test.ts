import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  PUBLIC_DETAIL_LIMIT,
  PUBLIC_SCOPE,
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_SCHEMA_VERSION,
  clearAllSnapshots,
  clearPublicSnapshots,
  clearSnapshots,
  halveList,
  listPublicDetailRoutes,
  listSnapshotKeys,
  pruneSnapshots,
  readPublicSnapshot,
  readSnapshot,
  snapshotKey,
  usePublicSnapshot,
  useSnapshot,
  writePublicSnapshot,
  writeSnapshot,
} from '@/frontend/shared/local-store/snapshot';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';

/**
 * The snapshot store (#495, and the public scope #555).
 *
 * It is what makes a cold navigation paint rows in the first frame, so the
 * contract that matters is small and load-bearing: a snapshot is only ever read
 * by the identity that wrote it, one entry per route (last visit wins), bounded,
 * ignored across a schema change, and gone on sign-out. The public half is the
 * mirror image: no identity, survives a sign-out, and a detail route's entries
 * are capped because their keys come from the address bar.
 */
describe('the snapshot store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearAllSnapshots();
  });

  it('round-trips the rows a surface painted', () => {
    writeSnapshot(userIdentity('abc'), 'habitflow', { habits: [{ id: 'h1' }], logs: [] });

    expect(readSnapshot(userIdentity('abc'), 'habitflow')).toEqual({
      habits: [{ id: 'h1' }],
      logs: [],
    });
  });

  it('answers null for a route this device never painted', () => {
    expect(readSnapshot(GUEST_IDENTITY, 'habitflow')).toBeNull();
  });

  it('keeps each identity in its own partition', () => {
    writeSnapshot(userIdentity('abc'), 'habitflow', { habits: ['a'] });
    writeSnapshot(GUEST_IDENTITY, 'habitflow', { habits: ['g'] });

    expect(readSnapshot(userIdentity('abc'), 'habitflow')).toEqual({ habits: ['a'] });
    expect(readSnapshot(GUEST_IDENTITY, 'habitflow')).toEqual({ habits: ['g'] });
    expect(readSnapshot(userIdentity('someone-else'), 'habitflow')).toBeNull();
  });

  it('holds one entry per route, so the last visit wins', () => {
    writeSnapshot(GUEST_IDENTITY, 'linksnap', { links: ['old'] });
    writeSnapshot(GUEST_IDENTITY, 'linksnap', { links: ['new'] });

    expect(readSnapshot(GUEST_IDENTITY, 'linksnap')).toEqual({ links: ['new'] });
    expect(listSnapshotKeys().filter((key) => key.includes('linksnap'))).toHaveLength(1);
  });

  it('ignores a snapshot written by another schema version', () => {
    writeSnapshot(GUEST_IDENTITY, 'blogpress', { posts: ['draft'] }, { version: 2 });

    expect(readSnapshot(GUEST_IDENTITY, 'blogpress')).toBeNull();
    expect(readSnapshot(GUEST_IDENTITY, 'blogpress', 2)).toEqual({ posts: ['draft'] });

    // The next paint under the current version replaces it rather than inheriting it.
    writeSnapshot(GUEST_IDENTITY, 'blogpress', { posts: ['next'] });
    expect(readSnapshot(GUEST_IDENTITY, 'blogpress')).toEqual({ posts: ['next'] });
  });

  it('ignores a corrupt entry instead of throwing', () => {
    window.localStorage.setItem(snapshotKey(GUEST_IDENTITY, 'habitflow'), '{not json');

    expect(readSnapshot(GUEST_IDENTITY, 'habitflow')).toBeNull();
  });

  it('stamps the entry with its version and route', () => {
    writeSnapshot(GUEST_IDENTITY, 'quran', { surah: 2, ayah: 255 });

    const raw = window.localStorage.getItem(snapshotKey(GUEST_IDENTITY, 'quran'));
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toMatchObject({
      v: SNAPSHOT_SCHEMA_VERSION,
      route: 'quran',
    });
  });

  it('trims to the byte budget through the trim it is given', () => {
    const big = Array.from({ length: 200 }, (_, index) => ({
      id: `row-${index}`,
      pad: 'x'.repeat(400),
    }));

    // No trim, and the value cannot fit: nothing is written, nothing is kept.
    writeSnapshot(GUEST_IDENTITY, 'spendtrack', { rows: big }, { maxBytes: 200 });
    expect(readSnapshot(GUEST_IDENTITY, 'spendtrack')).toBeNull();

    writeSnapshot(
      GUEST_IDENTITY,
      'spendtrack',
      { rows: big },
      {
        maxBytes: 4 * 1024,
        trim: (value) => {
          const rows = halveList(value.rows);
          return rows.length === 0 ? null : { rows };
        },
      }
    );

    const stored = readSnapshot<{ rows: { id: string }[] }>(GUEST_IDENTITY, 'spendtrack');
    expect(stored).not.toBeNull();
    expect(stored!.rows.length).toBeGreaterThan(0);
    expect(stored!.rows.length).toBeLessThan(big.length);
    expect(stored!.rows[0]?.id).toBe('row-0');
  });

  it('stops instead of looping when a trim does not shrink the value', () => {
    writeSnapshot(GUEST_IDENTITY, 'habitflow', { habits: ['previous'] });

    writeSnapshot(
      GUEST_IDENTITY,
      'habitflow',
      { habits: ['x'.repeat(SNAPSHOT_MAX_BYTES)] },
      { trim: (value) => value }
    );

    expect(readSnapshot(GUEST_IDENTITY, 'habitflow')).toBeNull();
  });

  it('removes the entry when the value cannot fit at all', () => {
    writeSnapshot(GUEST_IDENTITY, 'habitflow', { habits: ['previous'] });

    writeSnapshot(
      GUEST_IDENTITY,
      'habitflow',
      { habits: ['x'.repeat(SNAPSHOT_MAX_BYTES)] },
      { trim: () => null }
    );

    expect(readSnapshot(GUEST_IDENTITY, 'habitflow')).toBeNull();
  });

  it('drops every snapshot on sign-out', () => {
    writeSnapshot(userIdentity('abc'), 'habitflow', { habits: ['a'] });
    writeSnapshot(GUEST_IDENTITY, 'linksnap', { links: ['g'] });

    clearSnapshots();

    expect(readSnapshot(userIdentity('abc'), 'habitflow')).toBeNull();
    expect(readSnapshot(GUEST_IDENTITY, 'linksnap')).toBeNull();
  });

  it('keeps the public scope across a sign-out', () => {
    writePublicSnapshot('/news', { stories: ['digest'] });
    writeSnapshot(userIdentity('abc'), 'habitflow', { habits: ['a'] });

    clearSnapshots();

    expect(readPublicSnapshot('/news')).toEqual({ stories: ['digest'] });
    expect(readSnapshot(userIdentity('abc'), 'habitflow')).toBeNull();
  });

  it('returns one stable value per render until the stored string changes', () => {
    writeSnapshot(GUEST_IDENTITY, 'habitflow', { habits: ['a'] });

    const first = readSnapshot(GUEST_IDENTITY, 'habitflow');
    const second = readSnapshot(GUEST_IDENTITY, 'habitflow');
    expect(second).toBe(first);

    writeSnapshot(GUEST_IDENTITY, 'habitflow', { habits: ['b'] });
    expect(readSnapshot(GUEST_IDENTITY, 'habitflow')).not.toBe(first);
  });
});

/**
 * The public scope (#555).
 *
 * Two things separate it from the identity scope and both are load-bearing: the
 * key is a route with no reader in it, so it survives a sign-out; and a detail
 * route's key comes from the address bar, so those entries are capped rather
 * than left to grow with a crawl.
 */
describe('the public snapshot scope', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearAllSnapshots();
  });

  it('round-trips the rows a public surface painted', () => {
    writePublicSnapshot('/rates', { pairs: [{ code: 'USD', buy: 13000 }] });

    expect(readPublicSnapshot('/rates')).toEqual({ pairs: [{ code: 'USD', buy: 13000 }] });
  });

  it('keys one entry per route and keeps the filter query distinct', () => {
    writePublicSnapshot('/news', { digest: 'latest' });
    writePublicSnapshot('/news?category=tech', { digest: 'tech' });
    writePublicSnapshot('/news', { digest: 'next' });

    expect(readPublicSnapshot('/news')).toEqual({ digest: 'next' });
    expect(readPublicSnapshot('/news?category=tech')).toEqual({ digest: 'tech' });
    expect(listSnapshotKeys().filter((key) => key.includes('public:/news'))).toHaveLength(2);
  });

  it('is readable by a device that just signed out', () => {
    writePublicSnapshot('/community', { posts: ['a'] });

    clearSnapshots();

    expect(readPublicSnapshot('/community')).toEqual({ posts: ['a'] });
  });

  it('ignores a snapshot written by another schema version, and prunes it', () => {
    writePublicSnapshot('/news', { digest: 'old' }, { version: 2 });

    expect(readPublicSnapshot('/news')).toBeNull();

    // The stale bytes are dropped rather than left for the life of the origin.
    expect(pruneSnapshots()).toBe(1);
    expect(listSnapshotKeys()).toHaveLength(0);
  });

  it(`caps detail routes at ${PUBLIC_DETAIL_LIMIT} entries, evicting the oldest`, () => {
    for (let index = 0; index < PUBLIC_DETAIL_LIMIT + 5; index += 1) {
      writePublicSnapshot(`/community/post-${index}`, { title: `post ${index}` });
    }

    expect(listPublicDetailRoutes()).toHaveLength(PUBLIC_DETAIL_LIMIT);
    expect(readPublicSnapshot('/community/post-0')).toBeNull();
    expect(readPublicSnapshot(`/community/post-${PUBLIC_DETAIL_LIMIT + 4}`)).toEqual({
      title: `post ${PUBLIC_DETAIL_LIMIT + 4}`,
    });
  });

  it('treats a re-visited detail route as the newest, not as a second entry', () => {
    writePublicSnapshot('/community/first', { title: 'first' });
    writePublicSnapshot('/community/second', { title: 'second' });
    writePublicSnapshot('/community/first', { title: 'first again' });

    expect(listPublicDetailRoutes()).toEqual(['/community/first', '/community/second']);
    expect(listPublicDetailRoutes()).toHaveLength(2);

    // Refilling the cap after a touch evicts the route that was not touched.
    for (let index = 0; index < PUBLIC_DETAIL_LIMIT; index += 1) {
      writePublicSnapshot(`/verify/code-${index}`, { ok: true });
    }
    expect(readPublicSnapshot('/community/second')).toBeNull();
  });

  it('does not cap a list surface, whose keys the reader chose', () => {
    for (let index = 0; index < PUBLIC_DETAIL_LIMIT + 5; index += 1) {
      writePublicSnapshot('/news?date=2026-10-01', { digest: index });
    }

    expect(readPublicSnapshot('/news?date=2026-10-01')).toEqual({
      digest: PUBLIC_DETAIL_LIMIT + 4,
    });
    expect(listPublicDetailRoutes()).toHaveLength(0);
  });

  it('holds the byte budget like the identity scope', () => {
    writePublicSnapshot(
      '/news',
      { stories: ['x'.repeat(SNAPSHOT_MAX_BYTES)] },
      { trim: () => null }
    );

    expect(readPublicSnapshot('/news')).toBeNull();
    expect(listSnapshotKeys()).toHaveLength(0);
  });

  it('forgets the public scope on demand without touching an account', () => {
    writePublicSnapshot('/news', { digest: 'a' });
    writeSnapshot(userIdentity('abc'), 'habitflow', { habits: ['a'] });

    clearPublicSnapshots();

    expect(readPublicSnapshot('/news')).toBeNull();
    expect(readSnapshot(userIdentity('abc'), 'habitflow')).toEqual({ habits: ['a'] });
  });

  it('stamps the public entry with the public scope, never an identity', () => {
    writePublicSnapshot('/news', { digest: 'a' });

    const raw = window.localStorage.getItem(snapshotKey(PUBLIC_SCOPE, '/news'));
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('user:');
    expect(JSON.parse(raw as string)).toMatchObject({ v: SNAPSHOT_SCHEMA_VERSION, route: '/news' });
  });
});

/**
 * The hook's job is the first frame: it must answer during render, on the client,
 * without waiting for an effect.
 */
describe('useSnapshot', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearAllSnapshots();
  });

  it('renders the snapshot on the first client commit', () => {
    writeSnapshot(GUEST_IDENTITY, 'quran', { surah: 18, ayah: 10 });

    const { result } = renderHook(() => useSnapshot(GUEST_IDENTITY, 'quran'));

    expect(result.current).toEqual({ surah: 18, ayah: 10 });
  });

  it('follows a snapshot written after it mounted', () => {
    const { result } = renderHook(() => useSnapshot(GUEST_IDENTITY, 'quran'));
    expect(result.current).toBeNull();

    act(() => {
      writeSnapshot(GUEST_IDENTITY, 'quran', { surah: 36, ayah: 1 });
    });

    expect(result.current).toEqual({ surah: 36, ayah: 1 });
  });

  it('never reads another identity’s snapshot', () => {
    writeSnapshot(userIdentity('abc'), 'quran', { surah: 1, ayah: 1 });

    const { result } = renderHook(() => useSnapshot(GUEST_IDENTITY, 'quran'));

    expect(result.current).toBeNull();
  });
});

/**
 * The public hook answers the same way, and from a scope no sign-out can touch:
 * a signed-out device is exactly one of the readers it exists for.
 */
describe('usePublicSnapshot', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearAllSnapshots();
  });

  it('renders the public snapshot on the first client commit', () => {
    writePublicSnapshot('/news?category=tech', { digest: 'tech' });

    const { result } = renderHook(() => usePublicSnapshot('/news?category=tech'));

    expect(result.current).toEqual({ digest: 'tech' });
  });

  it('answers null for a route this device never painted', () => {
    const { result } = renderHook(() => usePublicSnapshot('/community'));

    expect(result.current).toBeNull();
  });

  it('is unaffected by a sign-out', () => {
    writePublicSnapshot('/rates', { pairs: [] });

    const { result } = renderHook(() => usePublicSnapshot('/rates'));
    act(() => {
      clearSnapshots();
    });

    expect(result.current).toEqual({ pairs: [] });
  });
});
