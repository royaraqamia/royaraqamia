import { describe, expect, it } from 'vitest';
import { lazyImageInitialState, lazyImageReducer } from '@/frontend/ui/LazyImage.reducer';

describe('lazyImageReducer', () => {
  it('starts on the WebP source, unloaded and without an error', () => {
    expect(lazyImageInitialState('photo.jpg', 'photo.webp')).toEqual({
      currentSrc: 'photo.webp',
      isLoaded: false,
      hasError: false,
    });
  });

  it('starts on the original when there is no WebP', () => {
    expect(lazyImageInitialState('photo.jpg')).toEqual({
      currentSrc: 'photo.jpg',
      isLoaded: false,
      hasError: false,
    });
  });

  it('marks the image loaded once', () => {
    const loaded = lazyImageReducer(lazyImageInitialState('photo.jpg'), { type: 'loaded' });
    expect(loaded.isLoaded).toBe(true);

    expect(lazyImageReducer(loaded, { type: 'loaded' })).toBe(loaded);
  });

  it('falls back from the WebP to the original once', () => {
    const failed = lazyImageReducer(lazyImageInitialState('photo.jpg', 'photo.webp'), {
      type: 'failed',
      src: 'photo.jpg',
      webpSrc: 'photo.webp',
    });

    expect(failed).toEqual({
      currentSrc: 'photo.jpg',
      isLoaded: false,
      hasError: false,
    });
  });

  it('reports a failure when the original is the one that failed', () => {
    const state = lazyImageReducer(lazyImageInitialState('photo.jpg'), {
      type: 'failed',
      src: 'photo.jpg',
    });

    expect(state.hasError).toBe(true);
  });

  it('reports a failure when the fallback fails too', () => {
    const fallback = lazyImageReducer(lazyImageInitialState('photo.jpg', 'photo.webp'), {
      type: 'failed',
      src: 'photo.jpg',
      webpSrc: 'photo.webp',
    });
    const state = lazyImageReducer(fallback, {
      type: 'failed',
      src: 'photo.jpg',
      webpSrc: 'photo.webp',
    });

    expect(state.hasError).toBe(true);
  });
});
