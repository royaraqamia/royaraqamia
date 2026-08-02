import type { Certificate } from '@/shared/contracts/certificates';

export interface CertificateCreateInput {
  certificate_code: string;
  student_name: string;
  course_name: string;
  issue_date: string;
  expiration_date: string | null;
  grade_or_status: string | null;
}

export interface CertificateUpdateInput {
  student_name: string;
  course_name: string;
  issue_date: string;
  expiration_date: string | null;
  grade_or_status: string | null;
}

export interface ICertificatesRepository {
  getByCode(code: string): Promise<Certificate | null>;
  list(
    page: number,
    pageSize: number,
    search: string
  ): Promise<{ data: Certificate[]; total: number }>;
  getById(id: string): Promise<Certificate | null>;
  create(input: CertificateCreateInput): Promise<Certificate>;
  update(id: string, input: CertificateUpdateInput): Promise<Certificate>;
  delete(id: string): Promise<void>;
}
