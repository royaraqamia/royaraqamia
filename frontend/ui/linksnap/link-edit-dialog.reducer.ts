/**
 * The edit dialog's form is one object, not ten: every field is reset together
 * when the dialog opens, the expiry pair is owned by one switch, and the
 * password pair by another. Keeping that in a reducer leaves the component with
 * the markup and the request, and makes the transitions testable without a DOM.
 */

/** The values the link already has — what "reset" returns to, and the diff base. */
export interface LinkEditBaseline {
  url: string;
  code: string;
  expiresAt: string | null;
  passwordProtected: boolean;
}

export interface LinkEditFormState {
  url: string;
  code: string;
  expiresDate: string;
  expiresTime: string;
  enableExpiry: boolean;
  passwordEnabled: boolean;
  password: string;
  showPassword: boolean;
  passwordError: string | null;
  copied: boolean;
}

export interface ExpiryParts {
  date: string;
  time: string;
}

export type LinkEditAction =
  | { type: 'reset'; baseline: LinkEditBaseline }
  | { type: 'urlChanged'; url: string }
  | { type: 'codeChanged'; code: string }
  | { type: 'expiryDateChanged'; date: string }
  | { type: 'expiryTimeChanged'; time: string }
  /** Seeded with the 7-day default, computed by the caller so the reducer stays pure. */
  | { type: 'expiryToggled'; fallback: ExpiryParts }
  | { type: 'expiryPresetApplied'; parts: ExpiryParts }
  | { type: 'passwordToggled' }
  | { type: 'passwordChanged'; password: string }
  | { type: 'passwordVisibilityToggled' }
  | { type: 'passwordErrorSet'; message: string | null }
  | { type: 'linkCopied' }
  | { type: 'copyFeedbackCleared' };

const SLUG_PATTERN = /[^a-zA-Z0-9_-]/g;
const SLUG_MAX = 16;
const DEFAULT_EXPIRY_HOURS = 24 * 7;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Splits an ISO timestamp into separate date (YYYY-MM-DD) and time (HH:mm) strings. */
export function splitExpiry(value: string | null): ExpiryParts {
  if (!value) return { date: '', time: '' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * The picker value `hoursFromNow` ahead of `now`. A parameter rather than a call
 * to `new Date()` inside the reducer, so a test can pin the clock.
 */
export function expiresInParts(hoursFromNow: number, now: Date = new Date()): ExpiryParts {
  const d = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function defaultExpiryParts(now: Date = new Date()): ExpiryParts {
  return expiresInParts(DEFAULT_EXPIRY_HOURS, now);
}

export function linkEditInitialState(baseline: LinkEditBaseline): LinkEditFormState {
  const parts = splitExpiry(baseline.expiresAt);
  return {
    url: baseline.url,
    code: baseline.code,
    expiresDate: parts.date,
    expiresTime: parts.time,
    enableExpiry: Boolean(baseline.expiresAt),
    passwordEnabled: baseline.passwordProtected,
    password: '',
    showPassword: false,
    passwordError: null,
    copied: false,
  };
}

export function linkEditReducer(
  state: LinkEditFormState,
  action: LinkEditAction
): LinkEditFormState {
  switch (action.type) {
    case 'reset':
      return linkEditInitialState(action.baseline);

    case 'urlChanged':
      return { ...state, url: action.url };

    case 'codeChanged':
      // The field only ever accepts slug characters, capped at the column's length.
      return { ...state, code: action.code.replace(SLUG_PATTERN, '').slice(0, SLUG_MAX) };

    case 'expiryDateChanged':
      return { ...state, expiresDate: action.date };

    case 'expiryTimeChanged':
      return { ...state, expiresTime: action.time };

    case 'expiryToggled':
      if (state.enableExpiry) {
        return { ...state, enableExpiry: false, expiresDate: '', expiresTime: '' };
      }
      return state.expiresDate
        ? { ...state, enableExpiry: true }
        : {
            ...state,
            enableExpiry: true,
            expiresDate: action.fallback.date,
            expiresTime: action.fallback.time,
          };

    case 'expiryPresetApplied':
      return {
        ...state,
        enableExpiry: true,
        expiresDate: action.parts.date,
        expiresTime: action.parts.time,
      };

    case 'passwordToggled':
      return { ...state, passwordEnabled: !state.passwordEnabled, passwordError: null };

    case 'passwordChanged':
      return { ...state, password: action.password, passwordError: null };

    case 'passwordVisibilityToggled':
      return { ...state, showPassword: !state.showPassword };

    case 'passwordErrorSet':
      return { ...state, passwordError: action.message };

    case 'linkCopied':
      return { ...state, copied: true };

    case 'copyFeedbackCleared':
      return state.copied ? { ...state, copied: false } : state;
  }
}

/** Whether the form differs from the link it was opened for. */
export function hasLinkEditChanges(state: LinkEditFormState, baseline: LinkEditBaseline): boolean {
  const initialExpiry = splitExpiry(baseline.expiresAt);
  return (
    state.url.trim() !== baseline.url.trim() ||
    state.code.trim() !== baseline.code.trim() ||
    state.passwordEnabled !== baseline.passwordProtected ||
    state.password.trim().length > 0 ||
    state.enableExpiry !== Boolean(baseline.expiresAt) ||
    (state.enableExpiry &&
      (state.expiresDate !== initialExpiry.date || state.expiresTime !== initialExpiry.time))
  );
}
