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
});
