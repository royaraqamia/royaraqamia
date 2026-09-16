import { describe, it, expect } from 'vitest';
import {
  TRAINING_APPLICATION_STATUSES,
  TRAINING_COURSE,
  TRAINING_EXPERIENCE_LABELS,
  TRAINING_REFERENCE_CODE_REGEX,
  TrainingApplicationSchema,
  TrainingApplicationUpdateSchema,
  buildApplicationWhatsappMessage,
  toNullableText,
} from '@/shared/contracts/training';

const validApplication = {
  course_slug: 'build-digital-products',
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  experience_level: 'basic',
  goal: 'أريد بناء متجر إلكتروني.',
};

describe('TrainingApplicationSchema', () => {
  it('accepts a valid application', () => {
    expect(TrainingApplicationSchema.safeParse(validApplication).success).toBe(true);
  });

  it('accepts an omitted email', () => {
    expect(TrainingApplicationSchema.safeParse(validApplication).success).toBe(true);
  });

  it('accepts an empty email string', () => {
    const result = TrainingApplicationSchema.safeParse({ ...validApplication, email: '' });
    expect(result.success).toBe(true);
  });

  it('accepts a valid email', () => {
    const result = TrainingApplicationSchema.safeParse({
      ...validApplication,
      email: 'student@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed email', () => {
    const result = TrainingApplicationSchema.safeParse({ ...validApplication, email: 'nope' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('البريد الإلكتروني');
  });

  it('reports a malformed email against the email field', () => {
    const result = TrainingApplicationSchema.safeParse({ ...validApplication, email: 'nope' });
    expect(result.error?.issues[0]?.path).toEqual(['email']);
    expect(result.error?.issues[0]?.message).toBe('البريد الإلكتروني غير صحيح');
  });

  it('rejects a one-character name', () => {
    const result = TrainingApplicationSchema.safeParse({ ...validApplication, full_name: 'أ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('حرفين');
  });

  it('rejects a malformed phone', () => {
    const result = TrainingApplicationSchema.safeParse({
      ...validApplication,
      phone_whatsapp: 'call-me',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('واتساب');
  });

  it('rejects an unknown course slug', () => {
    const result = TrainingApplicationSchema.safeParse({
      ...validApplication,
      course_slug: 'some-other-course',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown experience level', () => {
    const result = TrainingApplicationSchema.safeParse({
      ...validApplication,
      experience_level: 'expert',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a goal longer than 1000 characters', () => {
    const result = TrainingApplicationSchema.safeParse({
      ...validApplication,
      goal: 'ا'.repeat(1001),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('1,000');
  });
});

describe('TrainingApplicationUpdateSchema', () => {
  it('accepts every documented status', () => {
    for (const status of TRAINING_APPLICATION_STATUSES) {
      expect(TrainingApplicationUpdateSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    expect(TrainingApplicationUpdateSchema.safeParse({ status: 'archived' }).success).toBe(false);
  });
});

describe('TRAINING_COURSE', () => {
  it('keeps its slug inside COURSE_SLUGS', () => {
    expect(
      TrainingApplicationSchema.safeParse({
        ...validApplication,
        course_slug: TRAINING_COURSE.slug,
      }).success
    ).toBe(true);
  });

  it('labels every experience level', () => {
    for (const level of Object.keys(TRAINING_EXPERIENCE_LABELS)) {
      expect(
        TRAINING_EXPERIENCE_LABELS[level as keyof typeof TRAINING_EXPERIENCE_LABELS]
      ).toBeTruthy();
    }
  });
});

describe('TRAINING_REFERENCE_CODE_REGEX', () => {
  it('matches a generated-looking code', () => {
    expect(TRAINING_REFERENCE_CODE_REGEX.test('TRN-2026-A7K2M9QX')).toBe(true);
  });

  it('rejects a lowercase or short code', () => {
    expect(TRAINING_REFERENCE_CODE_REGEX.test('trn-2026-a7k2m9qx')).toBe(false);
    expect(TRAINING_REFERENCE_CODE_REGEX.test('TRN-2026-A7K2')).toBe(false);
  });
});

describe('toNullableText', () => {
  it('collapses blanks to null', () => {
    expect(toNullableText('   ')).toBeNull();
    expect(toNullableText(undefined)).toBeNull();
    expect(toNullableText('  أحمد  ')).toBe('أحمد');
  });
});

describe('buildApplicationWhatsappMessage', () => {
  it('includes the reference code so the operator can find the row', () => {
    const message = buildApplicationWhatsappMessage({
      referenceCode: 'TRN-2026-A7K2M9QX',
      fullName: 'أحمد العلي',
      courseTitle: TRAINING_COURSE.title,
    });
    expect(message).toContain('TRN-2026-A7K2M9QX');
    expect(message).toContain('أحمد العلي');
    expect(message).toContain(TRAINING_COURSE.title);
  });
});
