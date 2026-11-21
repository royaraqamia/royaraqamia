import { describe, expect, it, vi } from 'vitest';

import {
  CHAT_ATTACHMENT_ORPHAN_AGE_MS,
  ChatAttachmentSweepService,
  orphanedAttachmentPaths,
} from '@/backend/services/chat/chat-attachment-sweep';
import type {
  ChatAttachmentObject,
  ChatAttachmentSweepCursor,
  ChatAttachmentSweepRepository,
} from '@/backend/repositories/chat/chat-attachment-sweep-repository';

const now = Date.parse('2026-11-02T03:30:00.000Z');
const old = new Date(now - CHAT_ATTACHMENT_ORPHAN_AGE_MS - 60_000).toISOString();
const fresh = new Date(now - 60_000).toISOString();

function object(path: string, updatedAt: string | null, sizeBytes = 10): ChatAttachmentObject {
  return { path, updatedAt, sizeBytes };
}

describe('orphanedAttachmentPaths', () => {
  it('keeps what a row still claims, whatever its age', () => {
    expect(
      orphanedAttachmentPaths([object('c-1/u-1/a.pdf', old)], new Set(['c-1/u-1/a.pdf']), now)
    ).toEqual([]);
  });

  it('removes an unclaimed object older than the window', () => {
    expect(orphanedAttachmentPaths([object('c-1/u-1/a.pdf', old)], new Set(), now)).toEqual([
      'c-1/u-1/a.pdf',
    ]);
  });

  it('keeps an unclaimed object that could still be an upload in flight', () => {
    expect(orphanedAttachmentPaths([object('c-1/u-9/a.pdf', fresh)], new Set(), now)).toEqual([]);
  });

  it('keeps an object storage gave no timestamp for', () => {
    expect(orphanedAttachmentPaths([object('c-1/u-9/a.pdf', null)], new Set(), now)).toEqual([]);
  });
});

/**
 * A bucket with `count` orphans. Pages are a keyset read over live names, the
 * cursor really survives between `run` calls, and removals shrink the bucket —
 * the same contract the SQL repository has.
 */
function fakeBucket(count: number) {
  const all = Array.from({ length: count }, (_, index) =>
    object(`c/${String(index).padStart(5, '0')}/f.pdf`, old, 100)
  );
  const live = new Map(all.map((item) => [item.path, item]));
  const visited: string[] = [];
  const removed: string[] = [];
  const cursors: ChatAttachmentSweepCursor[] = [];
  let stored: ChatAttachmentSweepCursor | null = null;

  const repo: ChatAttachmentSweepRepository = {
    listReferencedPaths: async () => new Set(),
    readCursor: async () => stored,
    writeCursor: async (cursor) => {
      cursors.push(cursor);
      stored = cursor;
    },
    stats: async () => ({
      bucketObjects: live.size,
      bucketBytes: live.size * 100,
      rowObjects: 0,
      rowBytes: 0,
    }),
    listPage: async (after, limit) => {
      const page = [...live.values()].filter((item) => item.path > after).slice(0, limit);
      visited.push(...page.map((item) => item.path));
      return { objects: page, complete: page.length < limit };
    },
    removeObjects: async (paths) => {
      removed.push(...paths);
      for (const path of paths) live.delete(path);
    },
  };

  return { repo, all, visited, removed, cursors, live };
}

describe('ChatAttachmentSweepService', () => {
  it('removes the orphans and reports both the work and the bucket', async () => {
    const removeObjects = vi.fn(async () => undefined);
    const writeCursor = vi.fn(async () => undefined);
    const repo: ChatAttachmentSweepRepository = {
      listReferencedPaths: vi.fn(async () => new Set(['c-1/u-1/kept.pdf'])),
      listPage: vi.fn(async () => ({
        objects: [object('c-1/u-1/kept.pdf', old, 7), object('c-1/u-2/lost.pdf', old, 5)],
        complete: true,
      })),
      readCursor: vi.fn(async () => null),
      writeCursor,
      stats: vi.fn(async () => ({
        bucketObjects: 2,
        bucketBytes: 12,
        rowObjects: 1,
        rowBytes: 7,
      })),
      removeObjects,
    };

    const result = await new ChatAttachmentSweepService(repo).run(now);

    expect(removeObjects).toHaveBeenCalledWith(['c-1/u-2/lost.pdf']);
    expect(writeCursor).toHaveBeenCalledWith({
      lastPath: '',
      sweptAt: new Date(now).toISOString(),
    });
    expect(result).toEqual({
      scanned: 2,
      removed: 1,
      orphanBytes: 5,
      pages: 1,
      cursor: '',
      complete: true,
      bucketObjects: 2,
      bucketBytes: 12,
      rowObjects: 1,
      rowBytes: 7,
    });
  });

  it('drains 2,500 objects over two runs, visiting each exactly once', async () => {
    const bucket = fakeBucket(2500);
    const service = new ChatAttachmentSweepService(bucket.repo);

    const first = await service.run(now);
    expect(first.complete).toBe(false);
    expect(first.scanned).toBe(2000);
    expect(first.removed).toBe(2000);
    expect(first.orphanBytes).toBe(200_000);
    expect(first.pages).toBe(2);
    expect(bucket.cursors).toHaveLength(1);
    expect(bucket.cursors[0]?.lastPath).toBe(bucket.all[1999]!.path);

    const second = await service.run(now);
    expect(second.complete).toBe(true);
    expect(second.scanned).toBe(500);
    expect(second.orphanBytes).toBe(50_000);
    expect(bucket.visited).toHaveLength(2500);
    expect(new Set(bucket.visited).size).toBe(2500);
    expect(bucket.removed).toHaveLength(2500);
    expect(bucket.live.size).toBe(0);
    expect(bucket.cursors[1]?.lastPath).toBe('');
  });

  it('reports a bucket longer than one run as partial, with its cursor held', async () => {
    const bucket = fakeBucket(3000);

    const result = await new ChatAttachmentSweepService(bucket.repo).run(now);

    expect(result.complete).toBe(false);
    expect(result.pages).toBe(2);
    expect(result.scanned).toBe(2000);
    expect(result.cursor).toBe(bucket.all[1999]!.path);
    // The remainder is a number in the response, not a silent skip.
    expect(result.bucketObjects - result.scanned).toBe(1000);
  });
});
