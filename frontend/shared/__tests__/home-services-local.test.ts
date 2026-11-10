import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearGuestHomeServices,
  readGuestHomeServices,
  readHomeTab,
  writeGuestHomeServices,
  writeHomeTab,
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

/** The tab the door is showing, and the address that names it (ADR-0156). */
describe('the remembered homepage tab', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('reads the last tab this device opened', () => {
    writeHomeTab('/quran');
    expect(readHomeTab()).toBe('/quran');
  });

  it('lets ?tab= win over the remembered tab', () => {
    writeHomeTab('/athkar');
    window.history.replaceState({}, '', '/?tab=/quran');

    expect(readHomeTab()).toBe('/quran');
  });

  it('ignores a tab the catalog does not have', () => {
    writeHomeTab('/quran');
    window.history.replaceState({}, '', '/?tab=/admin');

    expect(readHomeTab()).toBe('/quran');
  });

  it('answers null when the address names nothing and nothing is remembered', () => {
    expect(readHomeTab()).toBeNull();
  });
});
