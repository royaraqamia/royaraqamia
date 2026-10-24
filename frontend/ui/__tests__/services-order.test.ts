import { describe, it, expect, beforeEach } from 'vitest';

import {
  SERVICES_ORDER_KEY,
  moveWithin,
  readServicesOrder,
  resolveServicesOrder,
  saveServicesOrder,
  slotAt,
} from '../navbar/services-order';

const ORDER = ['/a', '/b', '/c', '/d'];

beforeEach(() => {
  window.localStorage.clear();
});

describe('resolveServicesOrder', () => {
  it('returns the shipped order when the device remembers nothing', () => {
    expect(resolveServicesOrder(ORDER, null)).toEqual(ORDER);
    expect(resolveServicesOrder(ORDER, [])).toEqual(ORDER);
  });

  it('keeps the saved order', () => {
    expect(resolveServicesOrder(ORDER, ['/c', '/a', '/d', '/b'])).toEqual(['/c', '/a', '/d', '/b']);
  });

  it('drops a service the release no longer ships', () => {
    expect(resolveServicesOrder(ORDER, ['/gone', '/c', '/a'])).toEqual(['/c', '/a', '/b', '/d']);
  });

  it('appends a service the release added, where the default puts it', () => {
    expect(resolveServicesOrder(ORDER, ['/d', '/a'])).toEqual(['/d', '/a', '/b', '/c']);
  });

  it('ignores a repeated href', () => {
    expect(resolveServicesOrder(ORDER, ['/b', '/b', '/a'])).toEqual(['/b', '/a', '/c', '/d']);
  });
});

describe('moveWithin', () => {
  it('moves an item down', () => {
    expect(moveWithin(ORDER, 0, 2)).toEqual(['/b', '/c', '/a', '/d']);
  });

  it('moves an item up', () => {
    expect(moveWithin(ORDER, 3, 1)).toEqual(['/a', '/d', '/b', '/c']);
  });

  it('clamps a target past the end and refuses a source that is not there', () => {
    expect(moveWithin(ORDER, 1, 99)).toEqual(['/a', '/c', '/d', '/b']);
    expect(moveWithin(ORDER, 9, 0)).toEqual(ORDER);
    expect(moveWithin(ORDER, 2, 2)).toEqual(ORDER);
  });
});

describe('slotAt', () => {
  const rects = [
    { top: 100, height: 40 },
    { top: 140, height: 40 },
    { top: 180, height: 40 },
  ];

  it('clamps above the first row and below the last', () => {
    expect(slotAt(10, rects)).toBe(0);
    expect(slotAt(999, rects)).toBe(2);
  });

  it('answers the row the pointer is inside', () => {
    expect(slotAt(110, rects)).toBe(0);
    expect(slotAt(150, rects)).toBe(1);
    expect(slotAt(219, rects)).toBe(2);
  });

  it('falls to the row below a gap', () => {
    expect(slotAt(142, rects)).toBe(1);
  });
});

describe('the device copy', () => {
  it('round-trips through localStorage', () => {
    saveServicesOrder(['/d', '/a']);
    expect(window.localStorage.getItem(SERVICES_ORDER_KEY)).toBe('["/d","/a"]');
    expect(readServicesOrder()).toEqual(['/d', '/a']);
  });

  it('treats junk as no preference', () => {
    window.localStorage.setItem(SERVICES_ORDER_KEY, '{"not":"a list"}');
    expect(readServicesOrder()).toBeNull();

    window.localStorage.setItem(SERVICES_ORDER_KEY, '["", 7, "/a"]');
    expect(readServicesOrder()).toEqual(['/a']);
  });

  it('does nothing when the store is unavailable', () => {
    expect(readServicesOrder(null)).toBeNull();
    expect(() => saveServicesOrder(['/a'], null)).not.toThrow();
  });
});
