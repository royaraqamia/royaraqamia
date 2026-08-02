'use server';

import * as Sentry from '@sentry/nextjs';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import { createCertificatesService } from '@/backend/config/certificates';
import {
  CertificateCodeFormatError,
  CertificateDuplicateCodeError,
  CertificateValidationError,
} from '@/backend/services/certificates/certificates-service';
import type { Certificate } from '@/shared/contracts/certificates';

export type AdminCertificate = Certificate;

interface AdminActionResult {
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
  try {
    await requireAdminAuth();
    return await createCertificatesService(getAdminSupabase()).list(page, pageSize, search);
  } catch (error) {
    Sentry.captureException(error);
    return { data: [], total: 0 };
  }
}

export async function getCertificateById(id: string): Promise<AdminCertificate | null> {
  try {
    await requireAdminAuth();
    return await createCertificatesService(getAdminSupabase()).getById(id);
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
  },
  customCode?: string
): Promise<AdminActionResult> {
  try {
    await requireAdminAuth();

    const data = await createCertificatesService(getAdminSupabase()).create(formData, customCode);

    return { success: true, data };
  } catch (error) {
    Sentry.captureException(error);
    if (error instanceof CertificateValidationError) {
      return { success: false, error: error.message, fieldErrors: error.fieldErrors };
    }
    if (error instanceof CertificateCodeFormatError) {
      return { success: false, error: error.message };
    }
    if (error instanceof CertificateDuplicateCodeError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'حدث خطأ أثناء إنشاء الشهادة' };
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
  }
): Promise<AdminActionResult> {
  try {
    await requireAdminAuth();

    const data = await createCertificatesService(getAdminSupabase()).update(id, formData);

    return { success: true, data };
  } catch (error) {
    Sentry.captureException(error);
    if (error instanceof CertificateValidationError) {
      return { success: false, error: error.message, fieldErrors: error.fieldErrors };
    }
    return { success: false, error: 'حدث خطأ أثناء تحديث الشهادة' };
  }
}

export async function deleteCertificate(id: string): Promise<AdminActionResult> {
  try {
    await requireAdminAuth();
    await createCertificatesService(getAdminSupabase()).delete(id);
    return { success: true };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: 'حدث خطأ أثناء حذف الشهادة' };
  }
}
