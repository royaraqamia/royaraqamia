import { describe, expect, it } from 'vitest';

import { keyboardTarget, moveWithin, slotAtX } from '../home-tab-order';

/** The strip's order arithmetic (ADR-0202): one definition for drag and keyboard. */
describe('moveWithin', () => {
  it('moves an item forward and back', () => {
    expect(moveWithin(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveWithin(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('clamps the target to the list and refuses a missing source', () => {
    expect(moveWithin(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
    expect(moveWithin(['a', 'b', 'c'], -1, 0)).toEqual(['a', 'b', 'c']);
    expect(moveWithin(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('slotAtX', () => {
  const rects = [
    { left: 0, width: 100 },
    { left: 110, width: 100 },
    { left: 220, width: 100 },
  ];

  it('answers the pill whose midpoint is nearest the pointer', () => {
    expect(slotAtX(10, rects)).toBe(0);
    expect(slotAtX(50, rects)).toBe(0);
    expect(slotAtX(110, rects)).toBe(1);
    expect(slotAtX(150, rects)).toBe(1);
    expect(slotAtX(300, rects)).toBe(2);
  });

  it('clamps past the last pill and survives an empty strip', () => {
    expect(slotAtX(9_999, rects)).toBe(2);
    expect(slotAtX(10, [])).toBe(0);
  });
});

describe('keyboardTarget', () => {
  it('walks in the strip’s visual direction in RTL', () => {
    // The first tab is the rightmost, so ArrowLeft moves toward the end.
    expect(keyboardTarget(0, 'ArrowLeft', 3, true)).toBe(1);
    expect(keyboardTarget(1, 'ArrowRight', 3, true)).toBe(0);
    expect(keyboardTarget(0, 'ArrowRight', 3, true)).toBeNull();
    expect(keyboardTarget(2, 'ArrowLeft', 3, true)).toBeNull();
  });

  it('walks in the strip’s visual direction in LTR', () => {
    expect(keyboardTarget(0, 'ArrowRight', 3, false)).toBe(1);
    expect(keyboardTarget(1, 'ArrowLeft', 3, false)).toBe(0);
  });

  it('treats Home and End as the first and last tab', () => {
    expect(keyboardTarget(1, 'Home', 3, true)).toBe(0);
    expect(keyboardTarget(1, 'End', 3, true)).toBe(2);
    expect(keyboardTarget(0, 'Home', 3, true)).toBeNull();
  });

  it('ignores keys that are not reorder keys', () => {
    expect(keyboardTarget(1, 'Enter', 3, true)).toBeNull();
    expect(keyboardTarget(-1, 'ArrowLeft', 3, true)).toBeNull();
  });
});
