import { describe, it, expect, vi, beforeEach } from 'vitest';

const request = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ success: true, referenceCode: 'TRN-2026-A7K2M9QX' })
);
const writeSubmissionReceipt = vi.hoisted(() => vi.fn());

vi.mock('@/frontend/transport/http', () => ({
  request,
  ApiError: class ApiError extends Error {},
}));
vi.mock('@/frontend/shared/submission-receipt', () => ({ writeSubmissionReceipt }));

import {
  createLeadHttpSyncTransport,
  leadKindForIntent,
} from '@/frontend/api/leads/sync-transport';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

function entry(type: string, payload: Record<string, unknown>): OutboxEntry {
  return {
    seq: 1,
    id: 'x',
    entity: 'lead',
    type,
    payload,
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
  };
}

describe('createLeadHttpSyncTransport', () => {
  beforeEach(() => {
    request.mockClear();
    writeSubmissionReceipt.mockClear();
  });

  it('replays a training submit against its endpoint and records the receipt', async () => {
    const transport = createLeadHttpSyncTransport();
    await transport.send(entry('training.submit', { client_id: 'c-1', full_name: 'أحمد' }));

    expect(request).toHaveBeenCalledWith('/api/training/applications', {
      method: 'POST',
      body: JSON.stringify({ client_id: 'c-1', full_name: 'أحمد' }),
    });
    expect(writeSubmissionReceipt).toHaveBeenCalledWith('training', 'TRN-2026-A7K2M9QX');
  });

  it('replays a project-request submit and records its receipt kind', async () => {
    const transport = createLeadHttpSyncTransport();
    await transport.send(entry('project-request.submit', { client_id: 'c-2' }));

    expect(request).toHaveBeenCalledWith('/api/project-requests', {
      method: 'POST',
      body: JSON.stringify({ client_id: 'c-2' }),
    });
    expect(writeSubmissionReceipt).toHaveBeenCalledWith('projectRequest', 'TRN-2026-A7K2M9QX');
  });

  it('replays a retainer submit and records its receipt kind', async () => {
    const transport = createLeadHttpSyncTransport();
    await transport.send(entry('retainer.submit', { client_id: 'c-3' }));

    expect(request).toHaveBeenCalledWith('/api/retainers', {
      method: 'POST',
      body: JSON.stringify({ client_id: 'c-3' }),
    });
    expect(writeSubmissionReceipt).toHaveBeenCalledWith('retainer', 'TRN-2026-A7K2M9QX');
  });

  it('rejects an unknown intent type as permanent', async () => {
    const transport = createLeadHttpSyncTransport();
    await expect(transport.send(entry('nope.submit', {}))).rejects.toThrow(
      'Unknown outbox intent type: nope.submit'
    );
  });
});

describe('leadKindForIntent', () => {
  it('maps each intent type back to its form', () => {
    expect(leadKindForIntent('training.submit')).toBe('training');
    expect(leadKindForIntent('project-request.submit')).toBe('projectRequest');
    expect(leadKindForIntent('retainer.submit')).toBe('retainer');
    expect(leadKindForIntent('other.submit')).toBeNull();
  });
});
