import { describe, it, expect } from 'vitest';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';

describe('sanitizeOrFilterTerm', () => {
  it('replaces the or() delimiter characters with spaces', () => {
    expect(sanitizeOrFilterTerm('hello,world(test)')).toBe('hello world test');
  });

  it('returns an empty string when the term is only delimiters', () => {
    expect(sanitizeOrFilterTerm('(),')).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeOrFilterTerm('  spaced  ')).toBe('spaced');
  });

  it('passes a clean term through unchanged, including Arabic', () => {
    expect(sanitizeOrFilterTerm('تقنية رقمية')).toBe('تقنية رقمية');
    expect(sanitizeOrFilterTerm('cert-1234')).toBe('cert-1234');
  });

  it('leaves like() wildcards alone', () => {
    expect(sanitizeOrFilterTerm('50%')).toBe('50%');
  });
});
