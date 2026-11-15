import { describe, expect, it } from 'vitest';

import {
  fieldIsDenied,
  readableFields,
  readableText,
  type ScreenFieldCandidate,
} from '@/shared/contracts/screen-context-fields';
import {
  SCREEN_CONTEXT_FIELD_VALUE_CHARS_MAX,
  SCREEN_CONTEXT_TEXT_CHARS_MAX,
} from '@/shared/contracts/screen-context';

/**
 * The redaction rules (ADR-0181, decision 4; #1419).
 *
 * The allowlist is the surface saying what it may show; the denylist is the
 * contract saying what no surface may show, whatever it says. These cases are
 * the second half of that sentence — a form that tries anyway.
 */

function field(name: string, value: string, extra: Partial<ScreenFieldCandidate> = {}) {
  return { name, value, ...extra };
}

describe('readableFields', () => {
  it('shows the fields the surface’s allowlist names, and nothing else', () => {
    const fields = readableFields('spendtrack', [
      field('amount', '12.50'),
      field('category_id', 'groceries'),
      field('searchQuery', 'قهوة'),
      field('authorHandle', 'ali'),
    ]);

    expect(fields).toEqual({ amount: '12.50', category_id: 'groceries' });
  });

  it('publishes nothing at all for a surface with no policy', () => {
    expect(readableFields('home', [field('amount', '12.50')])).toEqual({});
  });

  it('publishes nothing for a surface that opted out, whatever it asks for', () => {
    const fields = readableFields('chats', [
      field('amount', '12.50'),
      field('description', 'رسالة خاصة'),
    ]);

    expect(fields).toEqual({});
    expect(readableText('chats', 'رسالة لم تُرسل بعد')).toBe('');
  });

  it('caps a long value and ignores an empty name', () => {
    const fields = readableFields('spendtrack', [
      field('description', 'ع'.repeat(500)),
      field('   ', 'قيمة بلا اسم'),
    ]);

    expect(fields.description).toHaveLength(SCREEN_CONTEXT_FIELD_VALUE_CHARS_MAX);
    expect(Object.keys(fields)).toEqual(['description']);
  });
});

describe('a form that tries anyway', () => {
  it('produces no password, no OTP and no card number', () => {
    // A form that hands over its whole state: three credentials, one ordinary
    // amount, and the same three wearing the form's own spelling.
    const snapshot = readableFields('spendtrack', [
      field('password', 'hunter2-secret'),
      field('code', '482913'),
      field('card_number', '4111 1111 1111 1111'),
      // The surface allows these names, so only the structural rule stops them:
      // one is a password input that renamed itself, one is an OTP hint, one is
      // a card hint on an ordinary text input.
      field('amount', '9999.99', { type: 'password' }),
      field('description', '482913', { autocomplete: 'one-time-code' }),
      field('currency', '4111 1111 1111 1111', { autocomplete: 'cc-number' }),
      field('category_id', 'groceries'),
    ]);

    expect(snapshot).toEqual({ category_id: 'groceries' });
    expect(JSON.stringify(snapshot)).not.toContain('911');
    expect(JSON.stringify(snapshot)).not.toContain('1111');
  });

  it('denies a credential by name, whatever its spelling', () => {
    for (const name of [
      'password',
      'passwd',
      'userPassword',
      'pass-code',
      'otp',
      'otpCode',
      'totpSeed',
      'card_number',
      'cardNumber',
      'cvv',
      'cvv2',
      'iban',
      'accessToken',
      'apiKey',
      'secret',
      'one-time-code',
      'securityCode',
    ]) {
      expect(fieldIsDenied(field(name, 'x')), name).toBe(true);
    }
  });

  it('denies a credential by input type and by autocomplete hint', () => {
    expect(fieldIsDenied(field('chosen', 'x', { type: 'password' }))).toBe(true);
    expect(fieldIsDenied(field('chosen', 'x', { type: 'hidden' }))).toBe(true);
    expect(fieldIsDenied(field('chosen', 'x', { autocomplete: 'current-password' }))).toBe(true);
    expect(fieldIsDenied(field('chosen', 'x', { autocomplete: 'one-time-code' }))).toBe(true);
    expect(fieldIsDenied(field('chosen', 'x', { autocomplete: 'cc-csc' }))).toBe(true);
  });

  it('leaves ordinary form fields alone', () => {
    for (const name of ['amount', 'category_id', 'description', 'currency', 'date', 'colorHex']) {
      expect(fieldIsDenied(field(name, 'x')), name).toBe(false);
    }
  });
});

describe('readableText', () => {
  it('caps an excerpt on a surface that may show one', () => {
    const text = readableText('quran-surah', 'ب'.repeat(5_000));

    expect(text).toHaveLength(SCREEN_CONTEXT_TEXT_CHARS_MAX);
  });

  it('publishes nothing on a surface whose policy allows no text', () => {
    expect(readableText('spendtrack', 'مبلغ 12.50')).toBe('');
  });
});
