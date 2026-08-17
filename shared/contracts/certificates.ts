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
  created_at: string;
}

/**
 * Public-facing certificate shape for the anonymous verify endpoints
 * (`/api/certificates/verify` and `/verify/[code]`). Strips internal recipient
 * info (user ids + recipient email) so it is never exposed to visitors.
 */
export type PublicCertificate = Omit<Certificate, 'recipient_email' | 'recipient_user_ids'>;

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

export interface VerifyResult {
  success: boolean;
  certificate?: PublicCertificate;
  error?: string;
  rateLimited?: boolean;
}
