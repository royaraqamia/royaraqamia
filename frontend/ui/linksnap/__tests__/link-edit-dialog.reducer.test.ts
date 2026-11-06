import { describe, expect, it } from 'vitest';
import {
  defaultExpiryParts,
  expiresInParts,
  hasLinkEditChanges,
  linkEditInitialState,
  linkEditReducer,
  splitExpiry,
  type LinkEditBaseline,
  type LinkEditFormState,
} from '@/frontend/ui/linksnap/link-edit-dialog.reducer';

const BASELINE: LinkEditBaseline = {
  url: 'https://example.com/target',
  code: 'old-slug',
  expiresAt: null,
  passwordProtected: false,
};

function stateOf(patch: Partial<LinkEditFormState> = {}): LinkEditFormState {
  return { ...linkEditInitialState(BASELINE), ...patch };
}

describe('linkEditInitialState', () => {
  it('seeds every field from the link it was opened for', () => {
    const expires = new Date(2026, 4, 1, 9, 30);
    const state = linkEditInitialState({
      url: 'https://example.com/a',
      code: 'a-slug',
      expiresAt: expires.toISOString(),
      passwordProtected: true,
    });

    expect(state).toEqual({
      url: 'https://example.com/a',
      code: 'a-slug',
      expiresDate: '2026-05-01',
      expiresTime: '09:30',
      enableExpiry: true,
      passwordEnabled: true,
      password: '',
      showPassword: false,
      passwordError: null,
      copied: false,
    });
  });

  it('leaves the pickers empty for a link with no expiry', () => {
    const state = linkEditInitialState(BASELINE);

    expect(state.expiresDate).toBe('');
    expect(state.expiresTime).toBe('');
    expect(state.enableExpiry).toBe(false);
  });
});

describe('linkEditReducer', () => {
  it('forgets every edit on reset', () => {
    const edited = stateOf({
      url: 'https://other.example',
      password: 'secret',
      enableExpiry: true,
    });

    expect(linkEditReducer(edited, { type: 'reset', baseline: BASELINE })).toEqual(
      linkEditInitialState(BASELINE)
    );
  });

  it('keeps only slug characters, capped at 16', () => {
    const state = linkEditReducer(stateOf(), {
      type: 'codeChanged',
      code: 'ab cd/ef_gh-ij!klmnop',
    });

    expect(state.code).toBe('abcdef_gh-ijklmn');
  });

  it('clears the password error as soon as the field is typed in', () => {
    const state = linkEditReducer(stateOf({ passwordEnabled: true, passwordError: 'مطلوبة' }), {
      type: 'passwordChanged',
      password: 'x',
    });

    expect(state.password).toBe('x');
    expect(state.passwordError).toBeNull();
  });

  it('clears the password error when the protection switch moves', () => {
    const state = linkEditReducer(stateOf({ passwordError: 'مطلوبة' }), {
      type: 'passwordToggled',
    });

    expect(state.passwordEnabled).toBe(true);
    expect(state.passwordError).toBeNull();
  });

  it('keeps the password error when only its visibility changes', () => {
    const state = linkEditReducer(stateOf({ passwordEnabled: true, passwordError: 'مطلوبة' }), {
      type: 'passwordVisibilityToggled',
    });

    expect(state.showPassword).toBe(true);
    expect(state.passwordError).toBe('مطلوبة');
  });

  it('clears the pickers when expiry is switched off', () => {
    const state = linkEditReducer(
      stateOf({ enableExpiry: true, expiresDate: '2026-05-01', expiresTime: '09:30' }),
      { type: 'expiryToggled', fallback: { date: '2026-01-08', time: '10:00' } }
    );

    expect(state).toMatchObject({ enableExpiry: false, expiresDate: '', expiresTime: '' });
  });

  it('seeds the fallback only when switching expiry on with no date yet', () => {
    const fallback = { date: '2026-01-08', time: '10:00' };

    expect(linkEditReducer(stateOf(), { type: 'expiryToggled', fallback })).toMatchObject({
      enableExpiry: true,
      expiresDate: '2026-01-08',
      expiresTime: '10:00',
    });

    expect(
      linkEditReducer(stateOf({ expiresDate: '2026-03-02', expiresTime: '08:15' }), {
        type: 'expiryToggled',
        fallback,
      })
    ).toMatchObject({ enableExpiry: true, expiresDate: '2026-03-02', expiresTime: '08:15' });
  });

  it('turns expiry on and writes both pickers for a preset', () => {
    const state = linkEditReducer(stateOf(), {
      type: 'expiryPresetApplied',
      parts: { date: '2026-02-01', time: '12:45' },
    });

    expect(state).toMatchObject({
      enableExpiry: true,
      expiresDate: '2026-02-01',
      expiresTime: '12:45',
    });
  });

  it('raises the copied flag and puts it back down', () => {
    const copied = linkEditReducer(stateOf(), { type: 'linkCopied' });

    expect(copied.copied).toBe(true);
    expect(linkEditReducer(copied, { type: 'copyFeedbackCleared' }).copied).toBe(false);
  });
});

describe('hasLinkEditChanges', () => {
  it('is false for an untouched form', () => {
    expect(hasLinkEditChanges(linkEditInitialState(BASELINE), BASELINE)).toBe(false);
  });

  it.each([
    ['the destination', { url: 'https://example.com/other' }],
    ['the slug', { code: 'new-slug' }],
    ['the protection switch', { passwordEnabled: true }],
    ['a typed password', { password: 'x' }],
    ['an enabled expiry', { enableExpiry: true, expiresDate: '2026-05-01' }],
  ])('is true once %s differs', (_label, patch) => {
    expect(hasLinkEditChanges(stateOf(patch), BASELINE)).toBe(true);
  });

  it('ignores surrounding whitespace in the url and slug', () => {
    expect(
      hasLinkEditChanges(
        stateOf({ url: `  ${BASELINE.url}  `, code: ` ${BASELINE.code} ` }),
        BASELINE
      )
    ).toBe(false);
  });

  it('treats a moved expiry as a change, including the hidden time', () => {
    const expires = new Date(2026, 4, 1, 9, 30);
    const baseline: LinkEditBaseline = { ...BASELINE, expiresAt: expires.toISOString() };
    const initial = linkEditInitialState(baseline);

    expect(hasLinkEditChanges(initial, baseline)).toBe(false);
    expect(hasLinkEditChanges({ ...initial, expiresTime: '10:00' }, baseline)).toBe(true);
  });
});

describe('expiry helpers', () => {
  it('splits an unparseable timestamp into empty picker values', () => {
    expect(splitExpiry('not a date')).toEqual({ date: '', time: '' });
    expect(splitExpiry(null)).toEqual({ date: '', time: '' });
  });

  it('computes the preset from an injected clock', () => {
    const now = new Date(2026, 0, 1, 10, 0);

    expect(expiresInParts(24, now)).toEqual({ date: '2026-01-02', time: '10:00' });
    expect(defaultExpiryParts(now)).toEqual({ date: '2026-01-08', time: '10:00' });
  });
});
