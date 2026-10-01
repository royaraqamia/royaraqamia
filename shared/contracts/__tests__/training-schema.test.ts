import { describe, it, expect } from 'vitest';
import {
  TRAINING_COURSE,
  TRAINING_MANUAL_STATUSES,
  TRAINING_REFERENCE_CODE_REGEX,
  TrainingApplicationSchema,
  TrainingApplicationUpdateSchema,
} from '@/shared/contracts/training';

const validApplication = {
  course_slug: 'build-digital-products',
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  goal: 'أريد بناء متجر إلكتروني.',
  cohort_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
};

describe('TrainingApplicationSchema', () => {
  it('accepts a valid application', () => {
    expect(TrainingApplicationSchema.safeParse(validApplication).success).toBe(true);
  });

  it('rejects an application with no cohort chosen', () => {
    const { cohort_id: _cohortId, ...withoutCohort } = validApplication;
    const result = TrainingApplicationSchema.safeParse(withoutCohort);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('اختيار');
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
  it('accepts every manually settable status', () => {
    for (const status of TRAINING_MANUAL_STATUSES) {
      expect(TrainingApplicationUpdateSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects `enrolled`, which only the seat-claiming enroll path may set', () => {
    expect(TrainingApplicationUpdateSchema.safeParse({ status: 'enrolled' }).success).toBe(false);
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
