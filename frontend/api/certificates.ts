import type { Certificate, VerifyResult } from '@/shared/contracts/certificates';
import { request } from '@/frontend/transport/http';

export type AdminCertificate = Certificate;

export interface AdminActionResult {
  success: boolean;
  data?: AdminCertificate;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function getCertificates(
  page = 1,
  pageSize = 20,
  search = ''
): Promise<{ data: AdminCertificate[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) params.set('search', search);
  try {
    return await request<{ data: AdminCertificate[]; total: number }>(
      `/api/certificates?${params.toString()}`
    );
  } catch {
    return { data: [], total: 0 };
  }
}

export async function getCertificateById(id: string): Promise<AdminCertificate | null> {
  try {
    return await request<AdminCertificate>(`/api/certificates/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

export async function createCertificate(
  formData: {
    student_name: string;
    course_name: string;
    issue_date: string;
    expiration_date?: string;
    grade_or_status?: string;
    recipient_user_ids?: string[];
  },
  customCode?: string
): Promise<AdminActionResult> {
  try {
    return await request<AdminActionResult>('/api/certificates', {
      method: 'POST',
      body: JSON.stringify({ formData, customCode }),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

export async function updateCertificate(
  id: string,
  formData: {
    student_name: string;
    course_name: string;
    issue_date: string;
    expiration_date?: string;
    grade_or_status?: string;
    recipient_user_ids?: string[];
  }
): Promise<AdminActionResult> {
  try {
    return await request<AdminActionResult>(`/api/certificates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(formData),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

export async function deleteCertificate(id: string): Promise<AdminActionResult> {
  try {
    return await request<AdminActionResult>(`/api/certificates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

export async function verifyCertificate(code: string): Promise<VerifyResult> {
  try {
    return await request<VerifyResult>('/api/certificates/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  } catch {
    return { success: false, error: 'حدث خطأ غير مُتوقَّع. الرَّجاء المحاولة مرَّة أخرى.' };
  }
}
