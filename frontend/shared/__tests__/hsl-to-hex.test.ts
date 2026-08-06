import { describe, expect, it } from 'vitest';
import { hslToHex } from '@/frontend/shared/hsl-to-hex';

describe('hslToHex', () => {
  it('converts space-separated hsl to hex', () => {
    expect(hslToHex('0 0% 0%')).toBe('#000000');
    expect(hslToHex('0 0% 100%')).toBe('#ffffff');
    expect(hslToHex('0 0% 50%')).toBe('#808080');
    expect(hslToHex('120 100% 25%')).toBe('#008000');
  });

  it('normalizes hue out of range', () => {
    expect(hslToHex('360 100% 50%')).toBe('#ff0000');
    expect(hslToHex('-120 100% 50%')).toBe('#0000ff');
  });

  it('clamps saturation and lightness', () => {
    expect(hslToHex('0 150% 50%')).toBe('#ff0000');
    expect(hslToHex('0 50% 150%')).toBe('#ffffff');
  });

  it('returns null for invalid input', () => {
    expect(hslToHex('')).toBeNull();
    expect(hslToHex('not a color')).toBeNull();
    expect(hslToHex('120')).toBeNull();
  });
});
