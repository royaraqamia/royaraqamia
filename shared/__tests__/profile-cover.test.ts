import { describe, expect, it } from 'vitest';

import {
  COVER_FIXTURES,
  COVER_PALETTE_COUNT,
  COVER_SHAPE_COUNT,
  coverLook,
  coverSeed,
  coverVars,
} from '../profile-cover';

/**
 * The seed the app mirrors (ADR-0201). These cases are the contract between the
 * two clients: the Kotlin test asserts the same fixtures, so an edit that moves
 * one implementation fails in the other.
 */
describe('coverLook', () => {
  it.each(COVER_FIXTURES)('paints $id with palette $palette, shape $shape', (fixture) => {
    expect(coverLook(fixture.id)).toEqual({ palette: fixture.palette, shape: fixture.shape });
  });

  it('stays inside the tokens it is allowed to name', () => {
    for (const fixture of COVER_FIXTURES) {
      const { palette, shape } = coverLook(fixture.id);
      expect(palette).toBeGreaterThanOrEqual(0);
      expect(palette).toBeLessThan(COVER_PALETTE_COUNT);
      expect(shape).toBeGreaterThanOrEqual(0);
      expect(shape).toBeLessThan(COVER_SHAPE_COUNT);
    }
  });

  it('does not move when the same id is asked again', () => {
    const id = 'd4e5f6a7-4444-4ddd-8eee-000000000004';
    expect(coverLook(id)).toEqual(coverLook(id));
    expect(coverVars(id)).toEqual(coverVars(id));
  });

  it('counts code points, so an Arabic handle and its bytes agree', () => {
    // Two units would be four if the sum ran over UTF-16 code units.
    expect(coverSeed('ص')).toBe(0x0635);
    expect(coverSeed('a')).toBe(0x61);
  });

  it('points at the palette the seed chose, not a second copy of it', () => {
    const vars = coverVars('a1b2c3d4-1111-4aaa-9bbb-000000000001');
    expect(vars['--cover-a']).toBe('var(--cover-11-a)');
    expect(vars['--cover-b']).toBe('var(--cover-11-b)');
    expect(vars['--cover-x']).toBe('40%');
  });
});
