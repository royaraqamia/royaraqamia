import {
  createAdminCertificatesService,
  verifyCertificateByCode,
} from '@/backend/config/certificates';
import {
  CertificateCodeFormatError,
  CertificateDuplicateCodeError,
  CertificateValidationError,
} from '@/backend/services/certificates/certificates-service';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import type { Certificate, CertificateIntakeInput } from '@/shared/contracts/certificates';

type AdminCertificate = Certificate;

interface AdminActionResult {
  success: boolean;
  data?: AdminCertificate;
  error?: string;
  fieldErrors?: Record<string, string>;
}

type CertificateInput = CertificateIntakeInput;

/**
 * The Certificate domain errors an Admin request may surface. Returning `null`
 * lets the Admin adapter fall back to its own `500` body.
 */
function mapCertificateError(error: unknown): HttpResult | null {
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
  return null;
}

export async function listCertificates(
  page: number,
  pageSize: number,
  search: string
): Promise<HttpResult> {
  return withAdminUser(async () =>
    jsonResult(200, await createAdminCertificatesService().list(page, pageSize, search))
  );
}

export async function getCertificateById(id: string): Promise<HttpResult> {
  return withAdminUser(async () => {
    const certificate = await createAdminCertificatesService().getById(id);
    return jsonResult(200, certificate ?? null);
  });
}

export async function createCertificate(body: {
  formData: CertificateInput;
  customCode?: string;
}): Promise<HttpResult> {
  return withAdminUser(
    async ({ userId }) => {
      const data = await createAdminCertificatesService().create(
        body.formData,
        body.customCode,
        userId
      );
      return jsonResult(200, { success: true, data } satisfies AdminActionResult);
    },
    {
      mapError: mapCertificateError,
      whenFailed: { success: false, error: 'حدث خطأ أثناء إنشاء الشهادة' },
    }
  );
}

export async function updateCertificate(id: string, body: CertificateInput): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const data = await createAdminCertificatesService().update(id, body);
      return jsonResult(200, { success: true, data } satisfies AdminActionResult);
    },
    {
      mapError: mapCertificateError,
      whenFailed: { success: false, error: 'حدث خطأ أثناء تحديث الشهادة' },
    }
  );
}

export async function deleteCertificate(id: string): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      await createAdminCertificatesService().delete(id);
      return jsonResult(200, { success: true } satisfies AdminActionResult);
    },
    { whenFailed: { success: false, error: 'حدث خطأ أثناء حذف الشهادة' } }
  );
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
