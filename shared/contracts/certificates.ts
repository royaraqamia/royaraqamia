export interface Certificate {
  id: string;
  certificate_code: string;
  student_name: string;
  course_name: string;
  issue_date: string;
  expiration_date: string | null;
  grade_or_status: string | null;
  created_at: string;
}

export interface VerifyResult {
  success: boolean;
  certificate?: Certificate;
  error?: string;
  rateLimited?: boolean;
}
