import { describe, it, expect, vi, beforeEach } from 'vitest';

const request = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock('@/frontend/transport/http', () => ({
  request,
  ApiError: class ApiError extends Error {},
}));

import { BOOKMARK_INTENT, POSITION_INTENT } from '@/frontend/api/quran/local-store';
import { pullQuranSync } from '@/frontend/api/quran/sync-api';
import { createQuranHttpSyncTransport } from '@/frontend/api/quran/sync-transport';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

function entry(type: string, payload: Record<string, unknown>): OutboxEntry {
  return {
    seq: 1,
    id: 'x',
    entity: type === POSITION_INTENT ? 'position' : 'bookmark',
    type,
    payload,
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
  };
}

describe('createQuranHttpSyncTransport', () => {
  beforeEach(() => request.mockClear());

  it('replays a position write as a POST carrying the write', async () => {
    const transport = createQuranHttpSyncTransport();
    const payload = {
      surah: 2,
      ayah: 255,
      updatedAt: '2026-10-19T10:00:00.000Z',
      clientId: 'c-1',
    };

    await transport.send(entry(POSITION_INTENT, payload));

    expect(request).toHaveBeenCalledWith('/quran/api/position', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });

  it('replays a bookmark write, tombstone and all, to the bookmarks route', async () => {
    const transport = createQuranHttpSyncTransport();
    const payload = {
      surah: 2,
      ayah: 255,
      deletedAt: '2026-10-19T11:00:00.000Z',
      updatedAt: '2026-10-19T11:00:00.000Z',
      clientId: 'c-2',
    };

    await transport.send(entry(BOOKMARK_INTENT, payload));

    expect(request).toHaveBeenCalledWith('/quran/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });

  it('rejects an unknown intent type as permanent', async () => {
    const transport = createQuranHttpSyncTransport();
    await expect(transport.send(entry('nope.set', {}))).rejects.toThrow(
      'Unknown outbox intent type: nope.set'
    );
  });
});

describe('pullQuranSync', () => {
  beforeEach(() => request.mockClear());

  it('asks for the whole set when the device has no cursor', async () => {
    await pullQuranSync(null);

    expect(request).toHaveBeenCalledWith('/quran/api/sync');
  });

  it('asks since the cursor the device advanced to', async () => {
    await pullQuranSync('2026-10-19T10:00:00.000Z');

    expect(request).toHaveBeenCalledWith('/quran/api/sync?since=2026-10-19T10%3A00%3A00.000Z');
  });
});
