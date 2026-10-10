import { describe, it, expect, vi, beforeEach } from 'vitest';

const request = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock('@/frontend/transport/http', () => ({
  request,
  ApiError: class ApiError extends Error {},
}));

import { createLinksnapHttpSyncTransport } from '@/frontend/api/linksnap/sync-transport';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

function entry(type: string, payload: Record<string, unknown>): OutboxEntry {
  return {
    seq: 1,
    id: 'x',
    entity: 'link',
    type,
    payload,
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
  };
}

const transport = () => createLinksnapHttpSyncTransport(() => 'tok-1');

describe('createLinksnapHttpSyncTransport', () => {
  beforeEach(() => request.mockClear());

  it('replays a link create as a shorten POST carrying the client code', async () => {
    await transport().send(
      entry('link.create', {
        clientId: 'l-1',
        code: 'promo',
        originalUrl: 'https://example.com',
        expiresAt: null,
        password: null,
        updatedAt: '2026-08-01T00:00:00Z',
      })
    );
    expect(request).toHaveBeenCalledWith('/linksnap/api/shorten', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-1' },
      body: JSON.stringify({
        originalUrl: 'https://example.com',
        customCode: 'promo',
        clientId: 'l-1',
        expiresAt: null,
        password: undefined,
        updatedAt: '2026-08-01T00:00:00Z',
      }),
    });
  });

  it('replays a link update as a PATCH to the links endpoint', async () => {
    await transport().send(
      entry('link.update', {
        clientId: 'l-1',
        code: 'promo',
        newCode: 'promo-2',
        originalUrl: 'https://example.com',
        expiresAt: null,
        updatedAt: '2026-08-01T00:00:00Z',
        deletedAt: null,
      })
    );
    expect(request).toHaveBeenCalledWith('/linksnap/api/links', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer tok-1' },
      body: JSON.stringify({
        code: 'promo',
        newCode: 'promo-2',
        originalUrl: 'https://example.com',
        expiresAt: null,
        updatedAt: '2026-08-01T00:00:00Z',
        deletedAt: null,
      }),
    });
  });

  it('replays a link delete as a DELETE carrying updatedAt', async () => {
    await transport().send(
      entry('link.delete', { clientId: 'l-1', code: 'promo', updatedAt: '2026-08-01T00:00:00Z' })
    );
    expect(request).toHaveBeenCalledWith('/linksnap/api/links?code=promo', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer tok-1' },
      body: JSON.stringify({ updatedAt: '2026-08-01T00:00:00Z' }),
    });
  });

  it('rejects an unknown intent type as permanent', async () => {
    await expect(transport().send(entry('nope.create', {}))).rejects.toThrow(
      'Unknown outbox intent type: nope.create'
    );
  });
});
