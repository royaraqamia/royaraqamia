import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearGuestHomeServices,
  readGuestHomeServices,
  writeGuestHomeServices,
} from '@/frontend/shared/home-services-local';

/** A guest's strip on this device (ADR-0146). */
describe('the guest homepage apps', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips an ordered list', () => {
    expect(writeGuestHomeServices(['/athkar', '/quran'])).toBe(true);
    expect(readGuestHomeServices()).toEqual(['/athkar', '/quran']);
  });

  it('drops a key the catalog no longer has, and a duplicate', () => {
    window.localStorage.setItem(
      'royaraqamia:home-services:v1',
      JSON.stringify(['/quran', '/admin', '/quran', '/athkar'])
    );

    expect(readGuestHomeServices()).toEqual(['/quran', '/athkar']);
  });

  it('answers an empty list for malformed storage', () => {
    window.localStorage.setItem('royaraqamia:home-services:v1', '{not json');
    expect(readGuestHomeServices()).toEqual([]);
  });

  it('clears after a merge', () => {
    writeGuestHomeServices(['/quran']);
    clearGuestHomeServices();
    expect(readGuestHomeServices()).toEqual([]);
  });
});
