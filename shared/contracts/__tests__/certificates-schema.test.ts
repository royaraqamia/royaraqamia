import { describe, it, expect } from 'vitest';
import {
  CertificateIntakeSchema,
  PublicCertificateSchema,
  VerifyRequestSchema,
  VerifyResultSchema,
} from '@/shared/contracts/certificates';

const validIntake = {
  student_name: 'أحمد محمد',
  course_name: 'برمجة الويب',
  issue_date: '2026-01-01',
};

function errorFor(overrides: Record<string, unknown>) {
  const result = CertificateIntakeSchema.safeParse({ ...validIntake, ...overrides });
  if (result.success) throw new Error('expected the schema to reject the input');
  const issue = result.error.issues[0];
  if (!issue) throw new Error('expected at least one issue');
  return issue;
}

describe('CertificateIntakeSchema', () => {
  it('accepts a valid intake', () => {
    expect(CertificateIntakeSchema.safeParse(validIntake).success).toBe(true);
  });

  it('rejects a one-character student name', () => {
    expect(errorFor({ student_name: 'أ' })).toMatchObject({
      path: ['student_name'],
      message: 'اسم الطالب قصير جداً',
    });
  });

  it('rejects a course name longer than 200 characters', () => {
    expect(errorFor({ course_name: 'أ'.repeat(201) })).toMatchObject({
      path: ['course_name'],
      message: 'اسم الدورة طويل جداً',
    });
  });

  it('accepts a boundary-length name (200 characters)', () => {
    expect(
      CertificateIntakeSchema.safeParse({ ...validIntake, student_name: 'أ'.repeat(200) }).success
    ).toBe(true);
  });

  it('rejects an invalid issue date', () => {
    expect(errorFor({ issue_date: 'not-a-date' })).toMatchObject({
      path: ['issue_date'],
      message: 'تاريخ الإصدار غير صالح',
    });
  });

  it('rejects an invalid expiration date', () => {
    expect(errorFor({ expiration_date: 'not-a-date' })).toMatchObject({
      path: ['expiration_date'],
      message: 'تاريخ الانتهاء غير صالح',
    });
  });

  it('rejects an expiration date that is not after the issue date', () => {
    expect(errorFor({ issue_date: '2026-06-01', expiration_date: '2026-01-01' })).toMatchObject({
      path: ['expiration_date'],
      message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار',
    });
  });

  it('rejects an expiration date equal to the issue date', () => {
    const result = CertificateIntakeSchema.safeParse({
      ...validIntake,
      issue_date: '2026-06-01',
      expiration_date: '2026-06-01',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an empty expiration date', () => {
    expect(CertificateIntakeSchema.safeParse({ ...validIntake, expiration_date: '' }).success).toBe(
      true
    );
  });

  it('rejects a grade or status longer than 100 characters', () => {
    expect(errorFor({ grade_or_status: 'أ'.repeat(101) }).path).toEqual(['grade_or_status']);
  });

  it('rejects an invalid recipient email', () => {
    expect(errorFor({ recipient_email: 'not-an-email' })).toMatchObject({
      path: ['recipient_email'],
      message: 'البريد الإلكتروني غير صالح',
    });
  });

  it('accepts an empty recipient email', () => {
    expect(CertificateIntakeSchema.safeParse({ ...validIntake, recipient_email: '' }).success).toBe(
      true
    );
  });

  it('rejects an invalid recipient user id', () => {
    expect(errorFor({ recipient_user_ids: ['not-a-uuid'] })).toMatchObject({
      message: 'معرِّف مستخدم غير صالح',
    });
  });

  it('accepts recipient user ids and omits them when absent', () => {
    const id = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';

    expect(
      CertificateIntakeSchema.safeParse({ ...validIntake, recipient_user_ids: [id] }).success
    ).toBe(true);
    expect(CertificateIntakeSchema.safeParse(validIntake).success).toBe(true);
  });
});

/**
 * The anonymous verify route's shapes (#658).
 *
 * They are schemas rather than types because the app decodes them: the generated
 * Kotlin type comes from here, so a field the route stops sending is a build
 * failure in the app instead of a card that draws an empty line.
 */
describe('PublicCertificateSchema', () => {
  const certificate = {
    id: '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b',
    certificate_code: 'COMP-2026-UHVW9SG5',
    student_name: 'أحمد محمد',
    course_name: 'برمجة الويب',
    issue_date: '2026-01-01',
    expiration_date: null,
    grade_or_status: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a certificate with no expiry and no grade', () => {
    expect(PublicCertificateSchema.safeParse(certificate).success).toBe(true);
  });

  it('carries the internal recipient fields nowhere', () => {
    const parsed = PublicCertificateSchema.parse({
      ...certificate,
      recipient_email: 'a@b.co',
      recipient_user_ids: [],
      created_by: 'admin',
    });

    expect(parsed).not.toHaveProperty('recipient_email');
    expect(parsed).not.toHaveProperty('recipient_user_ids');
    expect(parsed).not.toHaveProperty('created_by');
  });

  it('requires the fields the card draws', () => {
    const { student_name: _omitted, ...withoutName } = certificate;

    expect(PublicCertificateSchema.safeParse(withoutName).success).toBe(false);
  });
});

describe('VerifyRequestSchema', () => {
  it('accepts the code a visitor typed', () => {
    expect(VerifyRequestSchema.safeParse({ code: 'COMP-2026-UHVW9SG5' }).success).toBe(true);
  });

  it('rejects a body with no code', () => {
    expect(VerifyRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('VerifyResultSchema', () => {
  it('accepts a hit', () => {
    const result = VerifyResultSchema.safeParse({
      success: true,
      certificate: {
        id: 'id',
        certificate_code: 'COMP-2026-UHVW9SG5',
        student_name: 'أحمد محمد',
        course_name: 'برمجة الويب',
        issue_date: '2026-01-01',
        expiration_date: '2027-01-01',
        grade_or_status: 'ممتاز',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts a miss, a sent allowance and a server sentence', () => {
    expect(VerifyResultSchema.safeParse({ success: false }).success).toBe(true);
    expect(VerifyResultSchema.safeParse({ success: false, error: 'لا توجد شهادة' }).success).toBe(
      true
    );
    expect(
      VerifyResultSchema.safeParse({ success: false, rateLimited: true, error: 'حاول لاحقًا' })
        .success
    ).toBe(true);
  });

  it('rejects a body with no success flag', () => {
    expect(VerifyResultSchema.safeParse({ error: 'x' }).success).toBe(false);
  });
});
