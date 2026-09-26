import { z } from 'zod';
import { UserIdsSchema } from './users';

// Certificate Code Format: COMP-YYYY-XXXXXXXX (8 alphanumeric chars)
// Example: COMP-2026-A1B2C3D4
export const CERT_CODE_REGEX = /^COMP-\d{4}-[A-Z0-9]{8}$/;

export interface Certificate {
  id: string;
  certificate_code: string;
  student_name: string;
  course_name: string;
  issue_date: string;
  expiration_date: string | null;
  grade_or_status: string | null;
  recipient_email: string | null;
  recipient_user_ids: string[];
  /** The Admin who issued it. Null for certificates predating this column. */
  created_by: string | null;
  created_at: string;
}

/**
 * Public-facing certificate shape for the anonymous verify endpoints
 * (`/api/certificates/verify` and `/verify/[code]`). Strips internal recipient
 * info (user ids + recipient email) and the issuing Admin so none of it is
 * exposed to visitors.
 */
export type PublicCertificate = Omit<
  Certificate,
  'recipient_email' | 'recipient_user_ids' | 'created_by'
>;

export function toPublicCertificate(certificate: Certificate): PublicCertificate {
  return {
    id: certificate.id,
    certificate_code: certificate.certificate_code,
    student_name: certificate.student_name,
    course_name: certificate.course_name,
    issue_date: certificate.issue_date,
    expiration_date: certificate.expiration_date,
    grade_or_status: certificate.grade_or_status,
    created_at: certificate.created_at,
  };
}

// ------------------------------------------------------------
// Validation schema
// ------------------------------------------------------------

/**
 * The intake an Admin submits to issue or edit a Certificate. Validates only;
 * the service's `parseCertificate` normalises the parsed output for persistence.
 */
export const CertificateIntakeSchema = z
  .object({
    student_name: z.string().min(2, 'اسم الطالب قصير جداً').max(200, 'اسم الطالب طويل جداً'),
    course_name: z.string().min(2, 'اسم الدورة قصير جداً').max(200, 'اسم الدورة طويل جداً'),
    issue_date: z.string().refine((d) => !isNaN(Date.parse(d)), 'تاريخ الإصدار غير صالح'),
    expiration_date: z
      .string()
      .optional()
      .refine((d) => !d || !isNaN(Date.parse(d)), 'تاريخ الانتهاء غير صالح'),
    grade_or_status: z.string().max(100).optional(),
    recipient_email: z
      .string()
      .optional()
      .refine((e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), 'البريد الإلكتروني غير صالح'),
    recipient_user_ids: UserIdsSchema.optional(),
  })
  .refine(
    (data) => {
      if (!data.expiration_date) return true;
      return new Date(data.expiration_date) > new Date(data.issue_date);
    },
    { message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار', path: ['expiration_date'] }
  );

/** Raw intake as submitted by the Admin form, API or MCP tool. */
export type CertificateIntakeInput = z.input<typeof CertificateIntakeSchema>;

/** An optional intake field becomes `null` once the service normalises it. */
type NormalisedOnUndefined<T> = {
  [K in keyof T]-?: undefined extends T[K] ? Exclude<T[K], undefined> | null : T[K];
};

/**
 * The service's normalised intake: the parsed schema output with empty optional
 * values collapsed to `null` and recipient ids defaulted to an empty list. This
 * is the shape the repository persists.
 */
export type CertificateIntakeValues = Omit<
  NormalisedOnUndefined<CertificateIntakeInput>,
  'recipient_user_ids'
> & { recipient_user_ids: string[] };

export interface VerifyResult {
  success: boolean;
  certificate?: PublicCertificate;
  error?: string;
  rateLimited?: boolean;
}
