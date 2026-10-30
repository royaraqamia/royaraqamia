import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { createNewsSourceRequestsRepository } from '@/backend/repositories/news/news-source-requests';
import {
  NewsSourceRequestDbError,
  OPEN_REQUEST_URL_CONSTRAINT,
} from '@/backend/repositories/news/news-source-requests-repository';

function makeClient(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as SupabaseClient<Database>, insert };
}

describe('createNewsSourceRequestsRepository.insert', () => {
  it('keeps the SQLSTATE and the index that refused the row', async () => {
    const message = `duplicate key value violates unique constraint "${OPEN_REQUEST_URL_CONSTRAINT}"`;
    const { client } = makeClient({ data: null, error: { code: '23505', message } });
    const repository = createNewsSourceRequestsRepository(client);

    const failure = await repository
      .insert({ userId: 'u-1', url: 'https://example.com/rss', name: 'مثال' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NewsSourceRequestDbError);
    expect(failure).toMatchObject({
      code: '23505',
      constraint: OPEN_REQUEST_URL_CONSTRAINT,
      message,
    });
  });

  it('leaves the constraint empty when Postgres named none', async () => {
    const { client } = makeClient({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' },
    });
    const repository = createNewsSourceRequestsRepository(client);

    await expect(
      repository.insert({ userId: 'u-1', url: 'https://example.com/rss', name: 'مثال' })
    ).rejects.toMatchObject({ code: '42501', constraint: null });
  });

  it('returns the filed row', async () => {
    const { client, insert } = makeClient({
      data: {
        id: 'request-1',
        url: 'https://example.com/rss',
        name: 'مثال',
        status: 'resolving',
        kind: null,
        resolved_url: null,
        failure: null,
        failure_detail: null,
        attempts: 0,
        resolved_at: null,
        category: null,
        region: null,
        tier: null,
        note: null,
        created_at: '2026-10-25T00:00:00.000Z',
        reviewed_at: null,
        source_id: null,
      },
      error: null,
    });
    const repository = createNewsSourceRequestsRepository(client);

    const filed = await repository.insert({
      userId: 'u-1',
      url: 'https://example.com/rss',
      name: 'مثال',
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: 'u-1',
      url: 'https://example.com/rss',
      name: 'مثال',
      status: 'resolving',
    });
    expect(filed).toMatchObject({
      id: 'request-1',
      status: 'resolving',
      kind: null,
      resolvedUrl: null,
      attempts: 0,
      sourceId: null,
    });
  });
});
