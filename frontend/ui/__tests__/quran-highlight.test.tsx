import { describe, it, expect, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

import { AyahAnchorHighlight } from '@/frontend/ui/quran/ayah-highlight';

/**
 * The landing mark a search hit gets (P4).
 *
 * The hash is not part of the request — the sura is prerendered — so the only
 * place this can be checked is a DOM with a URL. What matters is that the mark
 * follows the hash rather than being set once: a reader moving from one hit to
 * another without a reload is the case a one-shot effect gets wrong.
 */

function drawAyat() {
  const container = document.createElement('div');
  for (const number of [1, 2, 3]) {
    const ayah = document.createElement('p');
    ayah.dataset.ayah = String(number);
    ayah.id = `ayah-${number}`;
    container.append(ayah);
  }
  document.body.append(container);
  return container;
}

const marked = () =>
  [...document.querySelectorAll('[data-ayah]')]
    .filter((element) => element.hasAttribute('data-ayah-target'))
    .map((element) => element.getAttribute('data-ayah'));

describe('the Ayah the URL points at', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  it('marks nothing when the URL names no Ayah', () => {
    drawAyat();
    render(<AyahAnchorHighlight />);
    expect(marked()).toEqual([]);
  });

  it('marks the Ayah the hash names', () => {
    window.history.replaceState({}, '', '/quran/2#ayah-2');
    drawAyat();
    render(<AyahAnchorHighlight />);

    expect(marked()).toEqual(['2']);
    expect(document.querySelector('[data-ayah="2"]')).toHaveAttribute('data-ayah-target');
  });

  it('moves the mark when the hash changes, so a second hit is not missed', () => {
    window.history.replaceState({}, '', '/quran/2#ayah-1');
    drawAyat();
    render(<AyahAnchorHighlight />);
    expect(marked()).toEqual(['1']);

    act(() => {
      window.history.replaceState({}, '', '/quran/2#ayah-3');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(marked()).toEqual(['3']);
  });

  it('drops the mark when the hash no longer names one', () => {
    window.history.replaceState({}, '', '/quran/2#ayah-2');
    drawAyat();
    render(<AyahAnchorHighlight />);

    act(() => {
      window.history.replaceState({}, '', '/quran/2');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(marked()).toEqual([]);
  });
});
