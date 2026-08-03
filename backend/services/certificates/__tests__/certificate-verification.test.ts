import { describe, it, expect, vi } from 'vitest';
import {
  createCertificateVerifier,
  CERT_CODE_REGEX,
  type CertificateVerifierDeps,
} from '@/backend/services/certificates/certificate-verification';
import type { Certificate } from '@/shared/contracts/certificates';
import type { ICertificatesRepository } from '@/backend/repositories/certificates/certificates-repository';

// ============================================================
// Test the certificate code validation logic
// ============================================================

describe('Certificate code format validation', () => {
  it('accepts valid COMP-YYYY-XXXXXXXX codes', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3D4')).toBe(true);
    expect(CERT_CODE_REGEX.test('COMP-2026-ABC23DEF')).toBe(true);
    expect(CERT_CODE_REGEX.test('COMP-2024-00000000')).toBe(true);
    expect(CERT_CODE_REGEX.test('COMP-2030-ZZZZZZZZ')).toBe(true);
  });

  it('rejects codes with wrong prefix', () => {
    expect(CERT_CODE_REGEX.test('CERT-2026-A1B2C3D4')).toBe(false);
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3D')).toBe(false);
  });

  it('rejects codes with lowercase letters', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-a1b2c3d4')).toBe(false);
  });

  it('rejects codes with special characters', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2-C3D4')).toBe(false);
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3D!')).toBe(false);
  });

  it('rejects codes that are too short', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3')).toBe(false);
    expect(CERT_CODE_REGEX.test('')).toBe(false);
  });

  it('rejects codes that are too long', () => {
    expect(CERT_CODE_REGEX.test('COMP-2026-A1B2C3D4E')).toBe(false);
  });

  it('rejects codes with invalid year format', () => {
    expect(CERT_CODE_REGEX.test('COMP-26-A1B2C3D4')).toBe(false);
    expect(CERT_CODE_REGEX.test('COMP-ABCD-A1B2C3D4')).toBe(false);
  });
});

// ============================================================
// Test the certificate verification service with injected deps
// ============================================================

function makeDeps(overrides: Partial<CertificateVerifierDeps> = {}) {
  const repository: ICertificatesRepository = {
    getByCode: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const checkRateLimit = vi.fn<CertificateVerifierDeps['checkRateLimit']>(async () => true);
  const captureMessage = vi.fn<CertificateVerifierDeps['captureMessage']>();
  const captureException = vi.fn<CertificateVerifierDeps['captureException']>();

  return {
    repository,
    checkRateLimit,
    captureMessage,
    captureException,
    verifier: createCertificateVerifier({
      repository,
      checkRateLimit,
      captureMessage,
      captureException,
      ...overrides,
    }),
  };
}

const sampleCertificate = {
  id: '1',
  certificate_code: 'COMP-2026-A1B2C3D4',
  student_name: 'أحمد',
  course_name: 'برمجة',
  issue_date: '2026-01-01',
  expiration_date: null,
  grade_or_status: null,
  created_at: '2026-01-01',
} as unknown as Certificate;

describe('Certificate verification service', () => {
  it('trims whitespace and uppercases before lookup', async () => {
    const { verifier, repository, checkRateLimit } = makeDeps();
    (repository.getByCode as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);

    const result = await verifier.verifyCertificateByCode('  comp-2026-a1b2c3d4  ', '1.2.3.4');

    expect(result.success).toBe(true);
    expect(repository.getByCode).toHaveBeenCalledWith('COMP-2026-A1B2C3D4');
    expect(checkRateLimit).toHaveBeenCalled();
  });

  it('returns format error and skips lookup for invalid codes', async () => {
    const { verifier, repository, checkRateLimit } = makeDeps();

    const result = await verifier.verifyCertificateByCode('NOT-A-CODE', '1.2.3.4');

    expect(result.success).toBe(false);
    expect(result.error).toContain('صيغة الرمز غير صالحة');
    expect(repository.getByCode).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('blocks requests that exceed the IP rate limit', async () => {
    const { verifier, repository } = makeDeps({
      checkRateLimit: vi.fn(async (key: string) => !key.startsWith('verify:1.2.3.4')),
    });

    const result = await verifier.verifyCertificateByCode('COMP-2026-A1B2C3D4', '1.2.3.4');

    expect(result).toEqual({
      success: false,
      error: 'تم تجاوز الحد المسموح. الرجاء المحاولة بعد دقيقة.',
      rateLimited: true,
    });
    expect(repository.getByCode).not.toHaveBeenCalled();
  });

  it('blocks requests that exceed the code rate limit (anti-enumeration)', async () => {
    const { verifier, repository } = makeDeps({
      checkRateLimit: vi.fn(async (key: string) => !key.includes('COMP-2026-A1B2C3D4')),
    });

    const result = await verifier.verifyCertificateByCode('COMP-2026-A1B2C3D4', '9.9.9.9');

    expect(result.success).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(repository.getByCode).not.toHaveBeenCalled();
  });

  it('returns not-found error when repository returns null', async () => {
    const { verifier, repository } = makeDeps();
    (repository.getByCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await verifier.verifyCertificateByCode('COMP-2026-A1B2C3D4', '1.2.3.4');

    expect(result.success).toBe(false);
    expect(result.error).toContain('لم يتم العثور');
  });

  it('returns the certificate on success', async () => {
    const { verifier, repository } = makeDeps();
    (repository.getByCode as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);

    const result = await verifier.verifyCertificateByCode('COMP-2026-A1B2C3D4', '1.2.3.4');

    expect(result).toEqual({ success: true, certificate: sampleCertificate });
  });

  it('reports unexpected errors and returns a generic message', async () => {
    const { verifier, repository, captureException } = makeDeps();
    const boom = new Error('db down');
    (repository.getByCode as ReturnType<typeof vi.fn>).mockRejectedValue(boom);

    const result = await verifier.verifyCertificateByCode('COMP-2026-A1B2C3D4', '1.2.3.4');

    expect(result.success).toBe(false);
    expect(result.error).toContain('حدث خطأ غير متوقع');
    expect(captureException).toHaveBeenCalledWith(boom, expect.any(Object));
  });
});
