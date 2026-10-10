import { describe, it, expect } from 'vitest';
import { ApiError } from '@/frontend/transport/http';
import {
  classifySyncError,
  errorMessage,
  PermanentSyncError,
} from '@/frontend/api/habitflow/sync-transport';

describe('classifySyncError', () => {
  it('treats other 4xx as permanent', () => {
    expect(classifySyncError(new ApiError('bad', 400))).toBe('permanent');
    expect(classifySyncError(new ApiError('gone', 404))).toBe('permanent');
    expect(classifySyncError(new ApiError('nope', 403))).toBe('permanent');
  });

  it('retries 5xx and the retryable 4xx', () => {
    expect(classifySyncError(new ApiError('boom', 500))).toBe('transient');
    expect(classifySyncError(new ApiError('timeout', 408))).toBe('transient');
    expect(classifySyncError(new ApiError('slow down', 429))).toBe('transient');
    expect(classifySyncError(new ApiError('conflict', 409))).toBe('transient');
  });

  it('treats a dropped connection (no status) as transient', () => {
    expect(classifySyncError(new TypeError('Failed to fetch'))).toBe('transient');
  });

  it('honours an explicit PermanentSyncError', () => {
    expect(classifySyncError(new PermanentSyncError('unknown intent'))).toBe('permanent');
  });
});

describe('errorMessage', () => {
  it('reads an Error message or stringifies anything else', () => {
    expect(errorMessage(new Error('nope'))).toBe('nope');
    expect(errorMessage('plain')).toBe('plain');
  });
});
