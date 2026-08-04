import type { CertificatesReader } from '@/backend/repositories/certificates/certificates-repository';
import type { Certificate, VerifyResult } from '@/shared/contracts/certificates';
import { CERT_CODE_REGEX } from '@/shared/contracts/certificates';
import { logger } from '@/shared/logger';

export { CERT_CODE_REGEX };

// 20 requests per 60 seconds per IP, 5 per code (anti-enumeration)
const IP_LIMIT = 20;
const CODE_LIMIT = 5;
const WINDOW_MS = 60_000;

export interface CertificateVerifierDeps {
  repository: CertificatesReader;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  captureMessage: (
    message: string,
    options?: { level?: 'info' | 'warning'; extra?: Record<string, unknown> }
  ) => void;
  captureException: (error: unknown, options?: { extra?: Record<string, unknown> }) => void;
}

/**
 * Certificate verification is a public, read-only operation — the
 * certificates table has an explicit RLS policy allowing public SELECT,
 * so the service role key is not needed and should not be used here.
 *
 * Constructor accepts injected dependencies (repository, rate limiter, telemetry)
 * so the verification logic is fully unit-testable without Supabase, Redis,
 * or Sentry.
 */
export class CertificateVerifier {
  constructor(private readonly deps: CertificateVerifierDeps) {}

  async getCertificateByCode(code: string): Promise<Certificate | null> {
    return this.deps.repository.getByCode(code.trim().toUpperCase());
  }

  async verifyCertificateByCode(code: string, ip: string): Promise<VerifyResult> {
    try {
      const sanitized = code.trim().toUpperCase();

      // Format validation
      if (!CERT_CODE_REGEX.test(sanitized)) {
        this.deps.captureMessage('Invalid certificate code format', {
          level: 'warning',
          extra: { code: sanitized, ip },
        });
        return {
          success: false,
          error: 'صيغة الرمز غير صالحة. الصيغة الصحيحة: COMP-YYYY-XXXXXXXX',
        };
      }

      // Rate limiting - IP level
      if (!(await this.deps.checkRateLimit(`verify:${ip}`, IP_LIMIT, WINDOW_MS))) {
        this.deps.captureMessage('Certificate verification IP rate limit exceeded', {
          level: 'warning',
          extra: { code: sanitized, ip },
        });
        return {
          success: false,
          error: 'تم تجاوز الحد المسموح. الرجاء المحاولة بعد دقيقة.',
          rateLimited: true,
        };
      }

      // Rate limiting - Code level (anti-enumeration)
      if (!(await this.deps.checkRateLimit(`verify:${sanitized}`, CODE_LIMIT, WINDOW_MS))) {
        this.deps.captureMessage('Certificate verification code rate limit exceeded', {
          level: 'warning',
          extra: { code: sanitized, ip },
        });
        return {
          success: false,
          error: 'تم تجاوز الحد المسموح. الرجاء المحاولة بعد دقيقة.',
          rateLimited: true,
        };
      }

      // Database lookup — uses publishable key, not service role
      const certificate = await this.deps.repository.getByCode(sanitized);

      if (!certificate) {
        this.deps.captureMessage('Certificate not found', {
          level: 'info',
          extra: { code: sanitized, ip },
        });
        return {
          success: false,
          error: 'لم يتم العثور على شهادة بهذا الرمز أو أن الرمز غير صالح.',
        };
      }

      this.deps.captureMessage('Certificate verified successfully', {
        level: 'info',
        extra: { code: sanitized, student: certificate.student_name, ip },
      });

      return { success: true, certificate };
    } catch (e) {
      logger.error('Unexpected error in verifyCertificateByCode', { error: String(e), code, ip });
      this.deps.captureException(e, {
        extra: { code, ip, source: 'verifyCertificateByCode' },
      });
      return {
        success: false,
        error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
      };
    }
  }
}

export function createCertificateVerifier(deps: CertificateVerifierDeps): CertificateVerifier {
  return new CertificateVerifier(deps);
}
