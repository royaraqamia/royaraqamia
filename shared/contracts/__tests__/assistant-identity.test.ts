import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_NAME_MAX,
  DEFAULT_ASSISTANT_IDENTITY,
  AssistantIdentityInputSchema,
  AssistantIdentitySchema,
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
        voice: 'feminine',
        tone: 'default',
        note: null,
      })
    ).toEqual({ name: null, avatarVariant: null, voice: 'feminine', tone: 'default', note: null });
  });

  it('refuses a variant outside the drawn set, an unknown tone and an unknown voice', () => {
    const base = { name: null, voice: 'feminine', tone: 'default', note: null };
    expect(AssistantIdentityInputSchema.safeParse({ ...base, avatarVariant: 0 }).success).toBe(
      false
    );
    expect(AssistantIdentityInputSchema.safeParse({ ...base, avatarVariant: 13 }).success).toBe(
      false
    );
    expect(
      AssistantIdentityInputSchema.safeParse({ ...base, avatarVariant: 1, tone: 'loud' }).success
    ).toBe(false);
    expect(
      AssistantIdentityInputSchema.safeParse({ ...base, avatarVariant: 1, voice: 'neutral' })
        .success
    ).toBe(false);
  });

  it('carries the Arabic refusal for a bad voice, not a schema word', () => {
    const result = AssistantIdentityInputSchema.safeParse({
      name: null,
      avatarVariant: null,
      voice: 'neutral',
      tone: 'default',
      note: null,
    });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0]?.message).toBe('صيغة الخطاب غير صالحة');
  });

  it('caps the note at a single line of 120 characters', () => {
    const base = { name: null, avatarVariant: null, voice: 'feminine', tone: 'default' };
    expect(AssistantIdentityInputSchema.safeParse({ ...base, note: 'ن'.repeat(120) }).success).toBe(
      true
    );
    expect(AssistantIdentityInputSchema.safeParse({ ...base, note: 'ن'.repeat(121) }).success).toBe(
      false
    );
  });
});

describe('the identity a member without a row reads (ADR-0228)', () => {
  it('draws the orb and speaks in the shipped feminine wording', () => {
    expect(DEFAULT_ASSISTANT_IDENTITY.avatarUrl).toBeNull();
    expect(DEFAULT_ASSISTANT_IDENTITY.voice).toBe('feminine');
    expect(AssistantIdentitySchema.parse(DEFAULT_ASSISTANT_IDENTITY)).toEqual(
      DEFAULT_ASSISTANT_IDENTITY
    );
  });
});
