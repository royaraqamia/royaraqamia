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
  created_at: string;
}

export interface VerifyResult {
  success: boolean;
  certificate?: Certificate;
  error?: string;
  rateLimited?: boolean;
}
