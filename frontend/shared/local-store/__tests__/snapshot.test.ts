import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_SCHEMA_VERSION,
  clearSnapshots,
  halveList,
  listSnapshotKeys,
  readSnapshot,
  snapshotKey,
  useSnapshot,
  writeSnapshot,
} from '@/frontend/shared/local-store/snapshot';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';

/**
 * The snapshot store (#495).
 *
 * It is what makes a cold navigation paint rows in the first frame, so the
 * contract that matters is small and load-bearing: a snapshot is only ever read
 * by the identity that wrote it, one entry per route (last visit wins), bounded,
 * ignored across a schema change, and gone on sign-out.
 */
describe('the snapshot store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearSnapshots();
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
 * The hook's job is the first frame: it must answer during render, on the client,
 * without waiting for an effect.
 */
describe('useSnapshot', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearSnapshots();
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
