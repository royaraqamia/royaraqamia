import { describe, expect, it } from 'vitest';
import { byteSizeParts, formatBytes } from '@/frontend/shared/format-bytes';

describe('formatBytes', () => {
  it('returns null for unknown or non-positive sizes', () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(undefined)).toBeNull();
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(-5)).toBeNull();
  });

  it('formats megabytes, capping precision for large values', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('≈ 5.0 م.ب');
    expect(formatBytes(25 * 1024 * 1024)).toBe('≈ 25 م.ب');
  });

  it('formats sub-megabyte sizes in kilobytes', () => {
    expect(formatBytes(512 * 1024)).toBe('≈ 512 ك.ب');
  });
});

describe('byteSizeParts', () => {
  it('returns a unit and an ASCII value the surface can put into its own words', () => {
    expect(byteSizeParts(52 * 1024 * 1024)).toEqual({ unit: 'mb', value: '52' });
    expect(byteSizeParts(5 * 1024 * 1024)).toEqual({ unit: 'mb', value: '5.0' });
    expect(byteSizeParts(512 * 1024)).toEqual({ unit: 'kb', value: '512' });
    expect(byteSizeParts(80)).toEqual({ unit: 'kb', value: '1' });
    expect(byteSizeParts(0)).toEqual({ unit: 'kb', value: '0' });
  });
});
