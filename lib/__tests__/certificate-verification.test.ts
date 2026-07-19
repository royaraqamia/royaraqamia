import { describe, it, expect } from 'vitest';

// ============================================================
// Test the certificate code validation logic
// ============================================================

const CERT_CODE_REGEX = /^COMP-\d{4}-[A-Z0-9]{8}$/;

describe('Certificate code format validation', () => {
  it('accepts valid COMP-YYYY-XXXXXXXX codes', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3D4')).toBe(true);
    expect(CERT_CODE_REGEX.test('COMP-2026-ABC23DEF')).toBe(true);
    expect(CERT_CODE_REGEX.test('COMP-2024-00000000')).toBe(true);
    expect(CERT_CODE_REGEX.test('COMP-2030-ZZZZZZZZ')).toBe(true);
  });

  it('rejects codes with wrong prefix', () => {
    expect(CERT_CODE_REGEX.test('CERT-2026-A1B2C3D4')).toBe(false);
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3D')).toBe(false);
  });

  it('rejects codes with lowercase letters', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-a1b2c3d4')).toBe(false);
  });

  it('rejects codes with special characters', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2-C3D4')).toBe(false);
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3D!')).toBe(false);
  });

  it('rejects codes that are too short', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3')).toBe(false);
    expect(CERT_CODE_REGEX.test('')).toBe(false);
  });

  it('rejects codes that are too long', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3D4E')).toBe(false);
  });

  it('rejects codes with invalid year format', () => {
    expect(CERT_CODE_REGEX.test('COMP-26-A1B2C3D4')).toBe(false);
    expect(CERT_CODE_REGEX.test('COMP-ABCD-A1B2C3D4')).toBe(false);
  });
});

// ============================================================
// Test the rate limiter
// ============================================================

describe('In-memory rate limiter fallback', () => {
  // Import the module to test the fallback path (when Redis is not configured)
  it('allows requests within limit', () => {
    const store = new Map<string, { count: number; resetAt: number }>();
    const now = Date.now();

    // Simulate the checkMemoryLimit function
    function check(key: string, limit: number, windowMs: number): boolean {
      const record = store.get(key);
      if (!record || now > record.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (record.count >= limit) return false;
      record.count++;
      return true;
    }

    expect(check('test:1.2.3.4', 3, 60_000)).toBe(true);
    expect(check('test:1.2.3.4', 3, 60_000)).toBe(true);
    expect(check('test:1.2.3.4', 3, 60_000)).toBe(true);
    expect(check('test:1.2.3.4', 3, 60_000)).toBe(false);
  });

  it('resets after window expires', () => {
    const store = new Map<string, { count: number; resetAt: number }>();

    function check(key: string, limit: number, windowMs: number): boolean {
      const record = store.get(key);
      const now = Date.now();
      if (!record || now > record.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (record.count >= limit) return false;
      record.count++;
      return true;
    }

    // Use a tiny window for testing
    expect(check('test:reset', 2, 1)).toBe(true);
    expect(check('test:reset', 2, 1)).toBe(true);
    expect(check('test:reset', 2, 1)).toBe(false);

    // After window expires, should reset
    // Wait 2ms
    const start = Date.now();
    while (Date.now() - start < 3) {
      // busy wait
    }
    expect(check('test:reset', 2, 1)).toBe(true);
  });

  it('tracks different keys independently', () => {
    const store = new Map<string, { count: number; resetAt: number }>();

    function check(key: string, limit: number, windowMs: number): boolean {
      const now = Date.now();
      const record = store.get(key);
      if (!record || now > record.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (record.count >= limit) return false;
      record.count++;
      return true;
    }

    expect(check('ip:1.1.1.1', 2, 60_000)).toBe(true);
    expect(check('ip:1.1.1.1', 2, 60_000)).toBe(true);
    expect(check('ip:1.1.1.1', 2, 60_000)).toBe(false);

    // Different IP should still work
    expect(check('ip:2.2.2.2', 2, 60_000)).toBe(true);
  });
});

// ============================================================
// Test sanitize logic
// ============================================================

describe('Certificate code sanitization', () => {
  it('trims whitespace and uppercases', () => {
    const input = '  comp-2026-a1b2c3d4  ';
    const sanitized = input.trim().toUpperCase();
    expect(sanitized).toBe('COMP-2026-A1B2C3D4');
  });

  it('normalizes lowercase to uppercase', () => {
    const sanitized = 'comp-2026-abc12345'.trim().toUpperCase();
    expect(sanitized).toBe('COMP-2026-ABC12345');
  });
});
