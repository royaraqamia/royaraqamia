import { describe, it, expect } from 'vitest';
import { toNullableText } from '@/shared/contracts/text';

describe('toNullableText', () => {
  it('collapses blanks to null', () => {
    expect(toNullableText('   ')).toBeNull();
    expect(toNullableText(undefined)).toBeNull();
    expect(toNullableText(null)).toBeNull();
  });

  it('trims a real value', () => {
    expect(toNullableText('  أحمد  ')).toBe('أحمد');
  });

  it('rewrites Arabic-Indic and Persian digits to ASCII', () => {
    expect(toNullableText('  \u0661\u0662\u0663  ')).toBe('123');
    expect(toNullableText('\u06f1\u06f2\u06f3')).toBe('123');
  });
});
