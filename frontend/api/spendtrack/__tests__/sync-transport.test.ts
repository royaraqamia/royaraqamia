import { describe, it, expect, vi, beforeEach } from 'vitest';

const request = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock('@/frontend/transport/http', () => ({
  request,
  ApiError: class ApiError extends Error {},
}));

import { createSpendtrackHttpSyncTransport } from '@/frontend/api/spendtrack/sync-transport';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

function entry(type: string, payload: Record<string, unknown>): OutboxEntry {
  return {
    seq: 1,
    id: 'x',
    entity: 'expense',
    type,
    payload,
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
  };
}

describe('createSpendtrackHttpSyncTransport', () => {
  beforeEach(() => request.mockClear());

  it('replays an expense create as a POST', async () => {
    const transport = createSpendtrackHttpSyncTransport();
    await transport.send(entry('expense.create', { clientId: 'e-1', amount: 5 }));
    expect(request).toHaveBeenCalledWith('/spendtrack/api/expenses', {
      method: 'POST',
      body: JSON.stringify({ clientId: 'e-1', amount: 5 }),
    });
  });

  it('replays an expense update as a PATCH to the row id', async () => {
    const transport = createSpendtrackHttpSyncTransport();
    await transport.send(entry('expense.update', { id: 'e-1', amount: 6 }));
    expect(request).toHaveBeenCalledWith('/spendtrack/api/expenses/e-1', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'e-1', amount: 6 }),
    });
  });

  it('replays an expense delete as a DELETE carrying updatedAt', async () => {
    const transport = createSpendtrackHttpSyncTransport();
    await transport.send(entry('expense.delete', { id: 'e-1', updatedAt: '2026-08-01T00:00:00Z' }));
    expect(request).toHaveBeenCalledWith('/spendtrack/api/expenses/e-1', {
      method: 'DELETE',
      body: JSON.stringify({ updatedAt: '2026-08-01T00:00:00Z' }),
    });
  });

  it('replays a budget delete with the month and category in the query', async () => {
    const transport = createSpendtrackHttpSyncTransport();
    await transport.send(entry('budget.delete', { month: '2026-08', categoryId: 'c-1' }));
    const [url, options] = request.mock.calls[0] as [string, { method: string }];
    expect(url).toBe('/spendtrack/api/budget?month=2026-08&categoryId=c-1');
    expect(options.method).toBe('DELETE');
  });

  it('rejects an unknown intent type as permanent', async () => {
    const transport = createSpendtrackHttpSyncTransport();
    await expect(transport.send(entry('nope.create', {}))).rejects.toThrow(
      'Unknown outbox intent type: nope.create'
    );
  });
});
