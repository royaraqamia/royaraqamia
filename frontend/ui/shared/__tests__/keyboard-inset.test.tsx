import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useKeyboardInset } from '../keyboard-inset';

/**
 * The two browsers disagree about who owns the shrink when the keyboard opens:
 * Chrome and the Android WebView resize the layout viewport, so `100dvh` already
 * ends at the keyboard; Safari keeps the layout viewport and hides the strip
 * inside the visual one, so that strip is the `--roy-keyboard-cover` a full-bleed
 * surface takes off its height. These cases pin the arithmetic for each, plus the
 * URL-bar change that must never be mistaken for a keyboard.
 */

const COVER = '--roy-keyboard-cover';
const OPEN = 'data-keyboard';

const SCREEN = 800;
const KEYBOARD = 300;

class FakeVisualViewport extends EventTarget {
  height = SCREEN;
}

let viewport: FakeVisualViewport;

/** The layout viewport: `window.innerHeight`, which is what `resize` moves. */
function resizeLayout(height: number) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  window.dispatchEvent(new Event('resize'));
}

function resizeVisual(height: number) {
  viewport.height = height;
  viewport.dispatchEvent(new Event('resize'));
}

function published() {
  const root = document.documentElement;
  return { open: root.getAttribute(OPEN), cover: root.style.getPropertyValue(COVER) };
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: SCREEN });
  viewport = new FakeVisualViewport();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
});

afterEach(() => {
  delete (window as { visualViewport?: unknown }).visualViewport;
  document.documentElement.removeAttribute(OPEN);
  document.documentElement.removeAttribute('style');
});

describe('useKeyboardInset', () => {
  it('reads a shrunk layout viewport as the keyboard, with nothing left to cover', () => {
    const { unmount } = renderHook(() => useKeyboardInset());
    expect(published()).toEqual({ open: null, cover: '0px' });

    resizeLayout(SCREEN - KEYBOARD);
    expect(published()).toEqual({ open: 'open', cover: '0px' });

    unmount();
  });

  it('reads a shrunk visual viewport as the keyboard, and the strip it hides', () => {
    const { unmount } = renderHook(() => useKeyboardInset());

    resizeVisual(SCREEN - KEYBOARD);
    expect(published()).toEqual({ open: 'open', cover: '300px' });

    // The dismissal puts the reading back.
    resizeVisual(SCREEN);
    expect(published()).toEqual({ open: null, cover: '0px' });

    unmount();
  });

  it('leaves a collapsing URL bar alone', () => {
    const { unmount } = renderHook(() => useKeyboardInset());

    resizeLayout(SCREEN - 80);
    expect(published()).toEqual({ open: null, cover: '0px' });

    // The shorter reading is the new baseline once it is closed, so closing the
    // bar is not read as a keyboard either.
    resizeVisual(SCREEN - 80);
    expect(published()).toEqual({ open: null, cover: '0px' });

    unmount();
  });

  it('clears the property when the last surface closes', () => {
    const first = renderHook(() => useKeyboardInset());
    const second = renderHook(() => useKeyboardInset());

    resizeLayout(SCREEN - KEYBOARD);
    expect(published().open).toBe('open');

    // A nested dialog keeps the reading alive while it is open.
    first.unmount();
    expect(published().open).toBe('open');

    second.unmount();
    expect(published()).toEqual({ open: null, cover: '' });
  });
});
