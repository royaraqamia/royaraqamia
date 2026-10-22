import { describe, it, expect } from 'vitest';
import { ApiError } from '@/frontend/transport/http';
import {
  classifySyncError,
  PermanentSyncError,
} from '@/frontend/shared/local-store/sync-transport';

describe('classifySyncError', () => {
  it('treats a 401 as transient so the Outbox re-arms after a lapsed session', () => {
    expect(classifySyncError(new ApiError('Unauthorized', 401))).toBe('transient');
  });

  it('keeps the retryable statuses transient', () => {
    for (const status of [408, 409, 425, 429]) {
      expect(classifySyncError(new ApiError('retry', status))).toBe('transient');
    }
  });

  it('keeps a 4xx the server rejected on its merits permanent', () => {
    for (const status of [400, 404, 422]) {
      expect(classifySyncError(new ApiError('bad request', status))).toBe('permanent');
    }
  });

  it('keeps a plan refusal (402) permanent, so the intent is surfaced not retried forever', () => {
    // An empty allowance or a reached cap will not clear by retrying: the queue
    // keeps the entry as failed and the user is asked to upgrade (ADR-0075).
    expect(classifySyncError(new ApiError('نفدت حصَّتك', 402))).toBe('permanent');
  });

  it('treats 5xx, a missing status and a non-HTTP error as transient', () => {
    expect(classifySyncError(new ApiError('boom', 503))).toBe('transient');
    expect(classifySyncError(new ApiError('no status'))).toBe('transient');
    expect(classifySyncError(new TypeError('network down'))).toBe('transient');
  });

  it('keeps an explicit PermanentSyncError permanent', () => {
    expect(classifySyncError(new PermanentSyncError('nope'))).toBe('permanent');
  });
});
