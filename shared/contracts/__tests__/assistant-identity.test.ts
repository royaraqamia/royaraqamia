import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_NAME_MAX,
  AssistantIdentityInputSchema,
  AssistantNameSchema,
} from '@/shared/contracts/assistant-identity';

/**
 * The name is the one field that reaches a model as data (ADR-0224), so its
 * alphabet, its length and the reserved names are the contract rather than the
 * form's business.
 */
describe('the assistant name', () => {
  it('accepts Arabic and Latin letters, ASCII digits and a single space', () => {
    for (const name of ['نور', 'Nour', 'نور 2', 'مساعدي']) {
      expect(AssistantNameSchema.parse(name)).toBe(name);
    }
  });

  it('trims the padding a member did not mean', () => {
    expect(AssistantNameSchema.parse('  نور  ')).toBe('نور');
  });

  it('refuses punctuation, an inner newline and a second space', () => {
    for (const name of ['نور!', 'نور\nنور', 'نور  نور', '@nour', 'نور?']) {
      expect(AssistantNameSchema.safeParse(name).success).toBe(false);
    }
  });

  it('refuses Arabic-Indic and Persian digits', () => {
    expect(AssistantNameSchema.safeParse('نور\u0661').success).toBe(false);
    expect(AssistantNameSchema.safeParse('نور\u06F1').success).toBe(false);
  });

  it('refuses an empty name and one longer than the cap', () => {
    expect(AssistantNameSchema.safeParse('   ').success).toBe(false);
    expect(AssistantNameSchema.safeParse('ن'.repeat(ASSISTANT_NAME_MAX + 1)).success).toBe(false);
  });

  it('refuses the names that would answer as the site', () => {
    for (const name of ['رؤية', 'رؤية رقمية', 'الإدارة', 'الدعم']) {
      expect(AssistantNameSchema.safeParse(name).success).toBe(false);
    }
  });
});

describe('the identity write', () => {
  it('accepts the default row: no name, no variant, the default tone', () => {
    expect(
      AssistantIdentityInputSchema.parse({
        name: null,
        avatarVariant: null,
        tone: 'default',
        note: null,
      })
    ).toEqual({ name: null, avatarVariant: null, tone: 'default', note: null });
  });

  it('refuses a variant outside the drawn set and an unknown tone', () => {
    const base = { name: null, tone: 'default', note: null };
    expect(AssistantIdentityInputSchema.safeParse({ ...base, avatarVariant: 0 }).success).toBe(
      false
    );
    expect(AssistantIdentityInputSchema.safeParse({ ...base, avatarVariant: 13 }).success).toBe(
      false
    );
    expect(
      AssistantIdentityInputSchema.safeParse({ ...base, avatarVariant: 1, tone: 'loud' }).success
    ).toBe(false);
  });

  it('caps the note at a single line of 120 characters', () => {
    const base = { name: null, avatarVariant: null, tone: 'default' };
    expect(AssistantIdentityInputSchema.safeParse({ ...base, note: 'ن'.repeat(120) }).success).toBe(
      true
    );
    expect(AssistantIdentityInputSchema.safeParse({ ...base, note: 'ن'.repeat(121) }).success).toBe(
      false
    );
  });
});
