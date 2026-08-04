import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '@/backend/shared/errors';
import { AppError } from '@/backend/shared/errors';

describe('getErrorMessage', () => {
  it('returns the message for Error instances', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe('something broke');
  });

  it('returns the message property for plain objects', () => {
    expect(getErrorMessage({ message: 'custom message' })).toBe('custom message');
  });

  it('coerces non-string message values to string', () => {
    expect(getErrorMessage({ message: 42 })).toBe('42');
  });

  it('returns the generic fallback for unknown values', () => {
    expect(getErrorMessage(null)).toBe('حدث خطأ غير متوقع.');
    expect(getErrorMessage(undefined)).toBe('حدث خطأ غير متوقع.');
    expect(getErrorMessage(42)).toBe('حدث خطأ غير متوقع.');
    expect(getErrorMessage('a raw string')).toBe('حدث خطأ غير متوقع.');
    expect(getErrorMessage(false)).toBe('حدث خطأ غير متوقع.');
  });

  it('returns the message for AppError', () => {
    expect(getErrorMessage(new AppError('app broke', 400))).toBe('app broke');
  });
});

describe('AppError', () => {
  it('defaults to statusCode 500 and no code', () => {
    const err = new AppError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AppError');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBeUndefined();
  });

  it('preserves the provided status code and code', () => {
    const err = new AppError('rate limited', 429, 'RATE_LIMITED');
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe('rate limited');
  });
});
