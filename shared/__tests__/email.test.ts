import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '@/shared/email';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('is idempotent', () => {
    expect(normalizeEmail(normalizeEmail('A@B.com'))).toBe('a@b.com');
  });
});
