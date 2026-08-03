import * as Sentry from '@sentry/nextjs';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import {
  createAdminCertificatesService,
  verifyCertificateByCode,
} from '@/backend/config/certificates';
import {
  CertificateCodeFormatError,
  CertificateDuplicateCodeError,
  CertificateValidationError,
} from '@/backend/services/certificates/certificates-service';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import type { Certificate } from '@/shared/contracts/certificates';

type AdminCertificate = Certificate;

interface AdminActionResult {
  success: boolean;
  data?: AdminCertificate;
  error?: string;
  fieldErrors?: Record<string, string>;
}

interface CertificateInput {
  student_name: string;
  course_name: string;
  issue_date: string;
  expiration_date?: string;
  grade_or_status?: string;
}

export async function listCertificates(
  page: number,
  pageSize: number,
  search: string
): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    return jsonResult(200, await createAdminCertificatesService().list(page, pageSize, search));
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(200, { data: [], total: 0 });
  }
}

export async function getCertificateById(id: string): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    const certificate = await createAdminCertificatesService().getById(id);
    return jsonResult(200, certificate ?? null);
  } catch {
    return jsonResult(200, null);
  }
}

export async function createCertificate(body: {
  formData: CertificateInput;
  customCode?: string;
}): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    const data = await createAdminCertificatesService().create(body.formData, body.customCode);
    return jsonResult(200, { success: true, data } satisfies AdminActionResult);
  } catch (error) {
    Sentry.captureException(error);
    if (error instanceof CertificateValidationError) {
      return jsonResult(400, {
        success: false,
        error: error.message,
        fieldErrors: error.fieldErrors,
      } satisfies AdminActionResult);
    }
    if (error instanceof CertificateCodeFormatError) {
      return jsonResult(400, { success: false, error: error.message } satisfies AdminActionResult);
    }
    if (error instanceof CertificateDuplicateCodeError) {
      return jsonResult(409, { success: false, error: error.message } satisfies AdminActionResult);
    }
    return jsonResult(500, {
      success: false,
      error: 'حدث خطأ أثناء إنشاء الشهادة',
    } satisfies AdminActionResult);
  }
}

export async function updateCertificate(id: string, body: CertificateInput): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    const data = await createAdminCertificatesService().update(id, body);
    return jsonResult(200, { success: true, data } satisfies AdminActionResult);
  } catch (error) {
    Sentry.captureException(error);
    if (error instanceof CertificateValidationError) {
      return jsonResult(400, {
        success: false,
        error: error.message,
        fieldErrors: error.fieldErrors,
      } satisfies AdminActionResult);
    }
    return jsonResult(500, {
      success: false,
      error: 'حدث خطأ أثناء تحديث الشهادة',
    } satisfies AdminActionResult);
  }
}

export async function deleteCertificate(id: string): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    await createAdminCertificatesService().delete(id);
    return jsonResult(200, { success: true } satisfies AdminActionResult);
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(500, {
      success: false,
      error: 'حدث خطأ أثناء حذف الشهادة',
    } satisfies AdminActionResult);
  }
}

export async function verifyCertificate(code: string, ip: string): Promise<HttpResult> {
  try {
    return jsonResult(200, await verifyCertificateByCode(code, ip));
  } catch {
    return jsonResult(200, {
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    });
  }
}
