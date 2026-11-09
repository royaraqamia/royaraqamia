import { afterEach, describe, expect, it } from 'vitest';

import { replaceSearch } from '../replace-search';

const start = () => window.location.href;

describe('replaceSearch', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('writes the query string without adding a history entry', () => {
    window.history.replaceState(null, '', '/rates');
    const before = window.history.length;

    replaceSearch('?from=USD&to=EUR');

    expect(window.location.search).toBe('?from=USD&to=EUR');
    expect(window.location.pathname).toBe('/rates');
    expect(window.history.length).toBe(before);
  });

  it('keeps the hash, so an Ayah anchor survives its tafsir', () => {
    window.history.replaceState(null, '', '/quran/2#ayah-5');

    replaceSearch('?tafsir=5');

    expect(window.location.pathname).toBe('/quran/2');
    expect(window.location.search).toBe('?tafsir=5');
    expect(window.location.hash).toBe('#ayah-5');
    expect(start()).toContain('/quran/2?tafsir=5#ayah-5');
  });

  it('clears the query when the search is empty', () => {
    window.history.replaceState(null, '', '/rates?from=USD');

    replaceSearch('');

    expect(window.location.pathname).toBe('/rates');
    expect(window.location.search).toBe('');
  });
});
