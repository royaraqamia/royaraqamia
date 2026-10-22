import { describe, it, expect } from 'vitest';
import { getErrorMessage, AppError, describeError } from '@/backend/shared/errors';

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

  it('falls back when a message is present but empty', () => {
    // supabase-js builds `{ message: '' }` when a response body cannot be read,
    // which used to reach the user as an empty error (#518 LinkSnap 500).
    expect(getErrorMessage({ message: '' })).toBe('حدث خطأ غير متوقع.');
    expect(getErrorMessage({ message: '   ' })).toBe('حدث خطأ غير متوقع.');
    expect(getErrorMessage(new Error(''))).toBe('حدث خطأ غير متوقع.');
  });

  it('returns the message for AppError', () => {
    expect(getErrorMessage(new AppError('app broke', 400))).toBe('app broke');
  });
});

describe('describeError', () => {
  it('names an Error instead of the useless "[object Object]"', () => {
    expect(describeError(new Error('boom'))).toBe('Error: boom');
    expect(describeError(new AppError('app broke', 400))).toBe('AppError: app broke');
  });

  it('serializes the plain objects supabase-js throws', () => {
    expect(describeError({ code: '42703', details: null, hint: null, message: 'no column' })).toBe(
      '{"code":"42703","details":null,"hint":null,"message":"no column"}'
    );
  });

  it('falls back to a string for values that cannot be serialized', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular)).toBe('[object Object]');
    expect(describeError('a raw string')).toBe('a raw string');
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
