import { randomInt } from 'crypto';
import type { CertificatesRepository } from '@/backend/repositories/certificates/certificates-repository';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import {
  CERT_CODE_REGEX,
  CertificateIntakeSchema,
  type Certificate,
  type CertificateIntakeInput,
  type CertificateIntakeValues,
} from '@/shared/contracts/certificates';
import { mintReferenceCode } from '@/shared/reference-code';

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

function parseCertificate(data: CertificateIntakeInput): CertificateIntakeValues {
  const parsed = CertificateIntakeSchema.safeParse(data);
  if (!parsed.success) {
    throw new CertificateValidationError(zodFieldErrors(parsed.error));
  }
  return {
    student_name: parsed.data.student_name,
    course_name: parsed.data.course_name,
    issue_date: parsed.data.issue_date,
    expiration_date: parsed.data.expiration_date || null,
    grade_or_status: parsed.data.grade_or_status || null,
    recipient_email: parsed.data.recipient_email?.trim() || null,
    recipient_user_ids: parsed.data.recipient_user_ids ?? [],
  };
}

const CERTIFICATE_CODE_PREFIX = 'COMP';

function generateCode(): string {
  return mintReferenceCode(CERTIFICATE_CODE_PREFIX, (maxExclusive) => randomInt(maxExclusive));
}

export interface CertificateIssuedNotifier {
  (info: { recipientUserIds: string[]; certificate: Certificate }): void;
}

export class CertificatesService {
  constructor(
    private readonly repository: CertificatesRepository,
    private readonly onCertificateIssued?: CertificateIssuedNotifier
  ) {}

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
    input: CertificateIntakeInput,
    customCode?: string,
    createdBy?: string | null
  ): Promise<Certificate> {
    const parsed = parseCertificate(input);

    const code = customCode?.trim().toUpperCase() || generateCode();
    if (customCode && !CERT_CODE_REGEX.test(code)) {
      throw new CertificateCodeFormatError();
    }

    let certificate: Certificate;
    try {
      certificate = await this.repository.create({
        certificate_code: code,
        ...parsed,
        created_by: createdBy ?? null,
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        throw new CertificateDuplicateCodeError();
      }
      throw error;
    }

    if (parsed.recipient_user_ids.length > 0) {
      this.onCertificateIssued?.({
        recipientUserIds: parsed.recipient_user_ids,
        certificate,
      });
    }

    return certificate;
  }

  async update(id: string, input: CertificateIntakeInput): Promise<Certificate> {
    const parsed = parseCertificate(input);

    const existing = await this.repository.getById(id);
    const updated = await this.repository.update(id, parsed);

    if (existing) {
      const existingIds = new Set(existing.recipient_user_ids ?? []);
      const newlyAddedIds = parsed.recipient_user_ids.filter((userId) => !existingIds.has(userId));
      if (newlyAddedIds.length > 0) {
        this.onCertificateIssued?.({
          recipientUserIds: newlyAddedIds,
          certificate: updated,
        });
      }
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    return this.repository.delete(id);
  }
}
