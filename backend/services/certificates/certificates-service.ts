import { randomInt } from 'crypto';
import { z } from 'zod';
import type { ICertificatesRepository } from '@/backend/repositories/certificates/certificates-repository';
import type { Certificate } from '@/shared/contracts/certificates';

export class CertificateValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super('بيانات غير صالحة');
    this.name = 'CertificateValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class CertificateCodeFormatError extends Error {
  constructor() {
    super('صيغة الرمز غير صالحة. الصيغة: COMP-YYYY-XXXXXXXX');
    this.name = 'CertificateCodeFormatError';
  }
}

export class CertificateDuplicateCodeError extends Error {
  constructor() {
    super('هذا الرمز مستخدم بالفعل. جرب رمزاً آخر.');
    this.name = 'CertificateDuplicateCodeError';
  }
}

const certificateSchema = z
  .object({
    student_name: z.string().min(2, 'اسم الطالب قصير جداً').max(200, 'اسم الطالب طويل جداً'),
    course_name: z.string().min(2, 'اسم الدورة قصير جداً').max(200, 'اسم الدورة طويل جداً'),
    issue_date: z.string().refine((d) => !isNaN(Date.parse(d)), 'تاريخ الإصدار غير صالح'),
    expiration_date: z
      .string()
      .optional()
      .refine((d) => !d || !isNaN(Date.parse(d)), 'تاريخ الانتهاء غير صالح'),
    grade_or_status: z.string().max(100).optional(),
  })
  .refine(
    (data) => {
      if (!data.expiration_date) return true;
      return new Date(data.expiration_date) > new Date(data.issue_date);
    },
    { message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار', path: ['expiration_date'] }
  );

function buildFieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0] as string;
    fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

function parseCertificate(data: {
  student_name: string;
  course_name: string;
  issue_date: string;
  expiration_date?: string;
  grade_or_status?: string;
}) {
  const parsed = certificateSchema.safeParse(data);
  if (!parsed.success) {
    throw new CertificateValidationError(buildFieldErrors(parsed.error.issues));
  }
  return {
    student_name: parsed.data.student_name,
    course_name: parsed.data.course_name,
    issue_date: parsed.data.issue_date,
    expiration_date: parsed.data.expiration_date || null,
    grade_or_status: parsed.data.grade_or_status || null,
  };
}

function generateCode(): string {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const charsArr = chars.split('');
  let random = '';
  for (let i = 0; i < 8; i++) {
    const idx = randomInt(charsArr.length);
    random += charsArr[idx] ?? '';
  }
  return `COMP-${year}-${random}`;
}

export class CertificatesService {
  constructor(private readonly repository: ICertificatesRepository) {}

  async list(
    page: number,
    pageSize: number,
    search: string
  ): Promise<{ data: Certificate[]; total: number }> {
    return this.repository.list(page, pageSize, search);
  }

  async getById(id: string): Promise<Certificate | null> {
    return this.repository.getById(id);
  }

  async create(
    input: {
      student_name: string;
      course_name: string;
      issue_date: string;
      expiration_date?: string;
      grade_or_status?: string;
    },
    customCode?: string
  ): Promise<Certificate> {
    const parsed = parseCertificate(input);

    const code = customCode?.trim().toUpperCase() || generateCode();
    if (customCode && !/^COMP-\d{4}-[A-Z0-9]{8}$/.test(code)) {
      throw new CertificateCodeFormatError();
    }

    try {
      return await this.repository.create({
        certificate_code: code,
        ...parsed,
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        throw new CertificateDuplicateCodeError();
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: {
      student_name: string;
      course_name: string;
      issue_date: string;
      expiration_date?: string;
      grade_or_status?: string;
    }
  ): Promise<Certificate> {
    const parsed = parseCertificate(input);
    return this.repository.update(id, parsed);
  }

  async delete(id: string): Promise<void> {
    return this.repository.delete(id);
  }
}
