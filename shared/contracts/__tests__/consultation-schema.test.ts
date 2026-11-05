import { describe, expect, it } from 'vitest';

import {
  AvailabilitySlotsResponseSchema,
  arabicCharCountNoun,
  BookingContactSchema,
  BookingResultSchema,
  ConsultationPackagesResponseSchema,
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

describe('the booking screen response shapes', () => {
  it('reads the packages the page renders', () => {
    const result = ConsultationPackagesResponseSchema.safeParse({
      packages: [
        {
          id: 'p-1',
          name: 'جلسة',
          description: null,
          price_usd: 25,
          duration_minutes: 60,
          sessions_count: 1,
          is_active: true,
          sort_order: 0,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('reads the slots the page renders and needs both ends', () => {
    const result = AvailabilitySlotsResponseSchema.safeParse({
      slots: [{ id: 's-1', starts_at: '2026-08-26T12:00:00Z', ends_at: '2026-08-26T13:00:00Z' }],
    });
    expect(result.success).toBe(true);

    const missingEnd = AvailabilitySlotsResponseSchema.safeParse({
      slots: [{ id: 's-1', starts_at: '2026-08-26T12:00:00Z' }],
    });
    expect(missingEnd.success).toBe(false);
  });

  it('reads a confirmed booking and a refusal', () => {
    expect(
      BookingResultSchema.safeParse({
        success: true,
        bookingId: 'b-1',
        referenceCode: 'CONS-2026-A7K2M9QX',
      }).success
    ).toBe(true);

    expect(
      BookingResultSchema.safeParse({ success: false, error: 'سبقك شخص آخر إلى هذا الموعد.' })
        .success
    ).toBe(true);
  });
});
