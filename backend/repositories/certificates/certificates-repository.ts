import type { Certificate, CertificateIntakeValues } from '@/shared/contracts/certificates';

export interface CertificateCreateInput extends CertificateIntakeValues {
  certificate_code: string;
  /** Set by the issuing Admin; the repository stores null when absent. */
  created_by?: string | null;
}

export type CertificateUpdateInput = CertificateIntakeValues;

export interface CertificatesReader {
  getByCode(code: string): Promise<Certificate | null>;
  getCodes(): Promise<string[]>;
  list(
    page: number,
    pageSize: number,
    search: string
  ): Promise<{ data: Certificate[]; total: number }>;
  getById(id: string): Promise<Certificate | null>;
  listByRecipient(userId: string): Promise<Certificate[]>;
}

export interface CertificatesWriter {
  create(input: CertificateCreateInput): Promise<Certificate>;
  update(id: string, input: CertificateUpdateInput): Promise<Certificate>;
  delete(id: string): Promise<void>;
}

export interface CertificatesRepository extends CertificatesReader, CertificatesWriter {}
