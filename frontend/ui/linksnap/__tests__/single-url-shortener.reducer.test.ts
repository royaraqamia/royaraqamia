import { describe, expect, it } from 'vitest';
import {
  shortenerInitialState,
  shortenerReducer,
  type ShortenerState,
} from '@/frontend/ui/linksnap/single-url-shortener.reducer';

function stateOf(patch: Partial<ShortenerState> = {}): ShortenerState {
  return { ...shortenerInitialState(), ...patch };
}

describe('shortenerInitialState', () => {
  it('starts empty, with no result and no QR', () => {
    expect(shortenerInitialState()).toEqual({
      originalUrl: '',
      customCode: '',
      password: '',
      shortenedUrl: null,
      copied: false,
      showQr: false,
      qrDataUrl: null,
    });
  });
});

describe('the fields', () => {
  it('keeps only slug characters in the custom code, capped at 16', () => {
    const state = shortenerReducer(stateOf(), {
      type: 'codeChanged',
      code: 'ab cd/ef_gh-ij!klmnop',
    });

    expect(state.customCode).toBe('abcdef_gh-ijklmn');
  });

  it('takes the destination and the password as typed', () => {
    const state = shortenerReducer(
      shortenerReducer(stateOf(), { type: 'urlChanged', url: 'https://example.com' }),
      { type: 'passwordChanged', password: 'سري' }
    );

    expect(state).toMatchObject({ originalUrl: 'https://example.com', password: 'سري' });
  });
});

describe('the result', () => {
  it('drops the previous link and its QR when a new submit starts', () => {
    const state = shortenerReducer(
      stateOf({
        shortenedUrl: 'https://sh/old',
        showQr: true,
        qrDataUrl: 'data:image/png;base64,x',
      }),
      { type: 'submitted' }
    );

    expect(state).toMatchObject({ shortenedUrl: null, showQr: false, qrDataUrl: null });
  });

  it('shows the new link', () => {
    expect(
      shortenerReducer(stateOf(), { type: 'shortened', url: 'https://sh/new' }).shortenedUrl
    ).toBe('https://sh/new');
  });
});

describe('the copy feedback', () => {
  it('raises and clears the flag', () => {
    const copied = shortenerReducer(stateOf(), { type: 'copyRaised' });
    expect(copied.copied).toBe(true);
    expect(shortenerReducer(copied, { type: 'copyCleared' }).copied).toBe(false);
  });
});

describe('the QR', () => {
  it('opens, closes, and remembers the generated image', () => {
    const generated = shortenerReducer(stateOf({ shortenedUrl: 'https://sh/new' }), {
      type: 'qrLoaded',
      dataUrl: 'data:image/png;base64,x',
    });
    expect(generated).toMatchObject({ showQr: true, qrDataUrl: 'data:image/png;base64,x' });

    expect(shortenerReducer(generated, { type: 'qrHidden' }).showQr).toBe(false);

    // Reopening does not throw the image away: it is a property of the link.
    const reopened = shortenerReducer(shortenerReducer(generated, { type: 'qrHidden' }), {
      type: 'qrShown',
    });
    expect(reopened).toMatchObject({ showQr: true, qrDataUrl: 'data:image/png;base64,x' });
  });
});

describe('reset', () => {
  it('clears the draft and the result but leaves the copy feedback alone', () => {
    const state = shortenerReducer(
      stateOf({
        originalUrl: 'https://example.com',
        customCode: 'slug',
        password: 'سري',
        shortenedUrl: 'https://sh/slug',
        copied: true,
        showQr: true,
        qrDataUrl: 'data:image/png;base64,x',
      }),
      { type: 'reset' }
    );

    expect(state).toEqual({
      originalUrl: '',
      customCode: '',
      password: '',
      shortenedUrl: null,
      copied: true,
      showQr: false,
      qrDataUrl: null,
    });
  });
});
