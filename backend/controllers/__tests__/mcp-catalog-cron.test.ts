import { describe, expect, it, vi } from 'vitest';

const { sync } = vi.hoisted(() => ({ sync: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/backend/shared/cron-auth', () => ({ isCronAuthorized: () => true }));
vi.mock('@/backend/config/mcp', () => ({
  createDefaultMcpCatalogService: () => ({ sync }),
}));

import { syncMcpCatalog } from '@/backend/controllers/mcp-catalog';

function jsonBody(result: Awaited<ReturnType<typeof syncMcpCatalog>>): Record<string, unknown> {
  if ('redirect' in result) throw new Error('unexpected redirect');
  return result.body as Record<string, unknown>;
}

/** The workflow checks the status with `--fail-with-body`, so an error in the
 * result has to reach it as a failed response, not a 200 with a note. */
describe('the scheduled catalogue mirror', () => {
  it('fails the HTTP call when the sync reports an error', async () => {
    sync.mockResolvedValueOnce({
      mode: 'incremental',
      pages: 2,
      rows: 7,
      skipped: 0,
      deleted: 0,
      completed: false,
      error: 'the incremental sync window was truncated twice in a row after 7 rows at cursor p2',
    });

    const result = await syncMcpCatalog(new Headers());

    expect(result.status).toBe(500);
    expect(jsonBody(result)).toMatchObject({
      success: false,
      error: expect.stringContaining('twice'),
    });
  });

  it('succeeds when the run closed its window', async () => {
    sync.mockResolvedValueOnce({
      mode: 'incremental',
      pages: 1,
      rows: 4,
      skipped: 0,
      deleted: 0,
      completed: true,
      error: null,
    });

    const result = await syncMcpCatalog(new Headers());

    expect(result.status).toBe(200);
    expect(jsonBody(result)).toMatchObject({ success: true, completed: true });
  });
});
