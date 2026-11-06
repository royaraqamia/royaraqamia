/**
 * The quick-shorten card is one small flow: three fields go in, one URL comes
 * out, and the QR is a property of that URL. Every handler wrote two or three of
 * these values at once — submitting cleared the previous result, resetting wrote
 * seven — so they are one state with named transitions.
 *
 * The submit failure message is not here: it belongs to `useShortenLink`, which
 * is the thing that failed.
 */

export interface ShortenerState {
  originalUrl: string;
  customCode: string;
  password: string;
  shortenedUrl: string | null;
  copied: boolean;
  showQr: boolean;
  qrDataUrl: string | null;
}

export type ShortenerAction =
  | { type: 'urlChanged'; url: string }
  | { type: 'codeChanged'; code: string }
  | { type: 'passwordChanged'; password: string }
  /** A submit started: the previous result is not the answer to this one. */
  | { type: 'submitted' }
  | { type: 'shortened'; url: string }
  | { type: 'copyRaised' }
  | { type: 'copyCleared' }
  | { type: 'qrHidden' }
  | { type: 'qrShown' }
  | { type: 'qrLoaded'; dataUrl: string }
  | { type: 'reset' };

const SLUG_PATTERN = /[^a-zA-Z0-9_-]/g;
const SLUG_MAX = 16;

export function shortenerInitialState(): ShortenerState {
  return {
    originalUrl: '',
    customCode: '',
    password: '',
    shortenedUrl: null,
    copied: false,
    showQr: false,
    qrDataUrl: null,
  };
}

export function shortenerReducer(state: ShortenerState, action: ShortenerAction): ShortenerState {
  switch (action.type) {
    case 'urlChanged':
      return { ...state, originalUrl: action.url };

    case 'codeChanged':
      return { ...state, customCode: action.code.replace(SLUG_PATTERN, '').slice(0, SLUG_MAX) };

    case 'passwordChanged':
      return { ...state, password: action.password };

    case 'submitted':
      return { ...state, shortenedUrl: null, showQr: false, qrDataUrl: null };

    case 'shortened':
      return { ...state, shortenedUrl: action.url };

    case 'copyRaised':
      return { ...state, copied: true };

    case 'copyCleared':
      return state.copied ? { ...state, copied: false } : state;

    case 'qrHidden':
      return { ...state, showQr: false };

    case 'qrShown':
      return { ...state, showQr: true };

    case 'qrLoaded':
      return { ...state, qrDataUrl: action.dataUrl, showQr: true };

    case 'reset':
      // `copied` is left alone: it is the copy button's own two-second feedback.
      return {
        ...state,
        originalUrl: '',
        customCode: '',
        password: '',
        shortenedUrl: null,
        showQr: false,
        qrDataUrl: null,
      };
  }
}
