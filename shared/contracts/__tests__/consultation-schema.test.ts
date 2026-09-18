import { describe, expect, it } from 'vitest';

import {
  arabicCharCountNoun,
  BookingContactSchema,
  TOPIC_DESCRIPTION_MAX,
  TOPIC_DESCRIPTION_MIN,
} from '../consultation';

const base = {
  full_name: 'أحمد',
  phone_whatsapp: '+963968478904',
};

describe('consultation topic bounds', () => {
  it('exposes the bounds the UI is expected to mirror', () => {
    expect(TOPIC_DESCRIPTION_MIN).toBe(30);
    expect(TOPIC_DESCRIPTION_MAX).toBe(2000);
  });

  it('rejects a topic shorter than the minimum using the shared bound', () => {
    const result = BookingContactSchema.safeParse({
      ...base,
      topic_description: 'أ'.repeat(TOPIC_DESCRIPTION_MIN - 1),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['topic_description'],
          message: `اشرح موضوع الاستشارة بما لا يقل عن ${TOPIC_DESCRIPTION_MIN} ${arabicCharCountNoun(
            TOPIC_DESCRIPTION_MIN
          )}`,
        })
      );
    }
  });

  it('accepts a topic exactly at the minimum', () => {
    const result = BookingContactSchema.safeParse({
      ...base,
      topic_description: 'أ'.repeat(TOPIC_DESCRIPTION_MIN),
    });

    expect(result.success).toBe(true);
  });

  it('rejects a topic beyond the maximum', () => {
    const result = BookingContactSchema.safeParse({
      ...base,
      topic_description: 'أ'.repeat(TOPIC_DESCRIPTION_MAX + 1),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['topic_description']);
      expect(result.error.issues[0]?.message).toContain('2,000');
    }
  });

  it('ignores surrounding whitespace when measuring the minimum', () => {
    const result = BookingContactSchema.safeParse({
      ...base,
      topic_description: `   ${'أ'.repeat(TOPIC_DESCRIPTION_MIN - 1)}   `,
    });

    expect(result.success).toBe(false);
  });
});

describe('arabicCharCountNoun', () => {
  it('agrees with the numeral', () => {
    expect(arabicCharCountNoun(1)).toBe('حرف');
    expect(arabicCharCountNoun(2)).toBe('حرفان');
    expect(arabicCharCountNoun(3)).toBe('أحرف');
    expect(arabicCharCountNoun(10)).toBe('أحرف');
    expect(arabicCharCountNoun(11)).toBe('حرفًا');
    expect(arabicCharCountNoun(TOPIC_DESCRIPTION_MIN)).toBe('حرفًا');
    expect(arabicCharCountNoun(99)).toBe('حرفًا');
    expect(arabicCharCountNoun(100)).toBe('حرف');
    expect(arabicCharCountNoun(TOPIC_DESCRIPTION_MAX)).toBe('حرف');
  });
});
