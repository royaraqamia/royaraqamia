import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockList = vi.fn();
const mockGetById = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockVerify = vi.fn();
const mockGetAuthUser = vi.fn();
const mockSyncAdminAllowlistMirror = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/env', () => ({
  env: { adminEmails: ['admin@example.com'] },
}));

vi.mock('@/backend/config/admin-allowlist', () => ({
  syncAdminAllowlistMirror: (emails: string[]) => mockSyncAdminAllowlistMirror(emails),
}));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => {
      const { user, supabase } = await mockGetAuthUser();
      return { user, client: supabase };
    },
    admin: async () => {
      const { user, supabase } = await mockGetAuthUser();
      if (!user) return { kind: 'anonymous' };
      if (user.email !== 'admin@example.com') return { kind: 'forbidden' };
      await mockSyncAdminAllowlistMirror(['admin@example.com']);
      return { kind: 'admin', identity: { user, client: supabase } };
    },
  });
});

vi.mock('@/backend/config/certificates', () => ({
  createAdminCertificatesService: () => ({
    list: mockList,
    getById: mockGetById,
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
  }),
  verifyCertificateByCode: (...args: unknown[]) => mockVerify(...args),
}));

import {
  createCertificate,
  deleteCertificate,
  getCertificateById,
  listCertificates,
  updateCertificate,
  verifyCertificate,
} from '@/backend/controllers/certificates';
import {
  CertificateCodeFormatError,
  CertificateDuplicateCodeError,
  CertificateValidationError,
} from '@/backend/services/certificates/certificates-service';

const CERTIFICATE = {
  id: 'cert-1',
  certificate_code: 'COMP-2026-ABCDEFGH',
  student_name: 'أحمد العلي',
  course_name: 'بناء المنتجات الرقمية',
  issue_date: '2026-01-01',
  expiration_date: null,
  grade_or_status: null,
  recipient_email: null,
  recipient_user_ids: [],
};

const FORM_DATA = {
  student_name: 'أحمد العلي',
  course_name: 'بناء المنتجات الرقمية',
  issue_date: '2026-01-01',
};

const ADMIN_SESSION = {
  user: { id: 'admin-1', email: 'admin@example.com' },
  supabase: {},
};
const NON_ADMIN_SESSION = { user: { id: 'u-2', email: 'user@example.com' }, supabase: {} };
const SIGNED_OUT = { user: null, supabase: {} };

async function readBody<T>(result: Awaited<ReturnType<typeof listCertificates>>): Promise<T> {
  if ('redirect' in result) {
    throw new Error('unexpected redirect');
  }
  return result.body as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue(ADMIN_SESSION);
  mockSyncAdminAllowlistMirror.mockResolvedValue(undefined);
  mockList.mockResolvedValue({ data: [CERTIFICATE], total: 1 });
  mockGetById.mockResolvedValue(CERTIFICATE);
  mockCreate.mockResolvedValue(CERTIFICATE);
  mockUpdate.mockResolvedValue(CERTIFICATE);
  mockDelete.mockResolvedValue(undefined);
  mockVerify.mockResolvedValue({ success: true, certificate: CERTIFICATE });
});

describe('listCertificates', () => {
  it('returns 401 when signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await listCertificates(1, 20, '');

    expect(result).toMatchObject({ status: 401 });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await listCertificates(1, 20, '');

    expect(result).toMatchObject({ status: 403 });
    expect(mockList).not.toHaveBeenCalled();
    expect(mockSyncAdminAllowlistMirror).not.toHaveBeenCalled();
  });

  it('returns the frozen success payload for an admin', async () => {
    const result = await listCertificates(2, 10, 'أحمد');

    expect(result.status).toBe(200);
    await expect(readBody<{ data: unknown[]; total: number }>(result)).resolves.toEqual({
      data: [CERTIFICATE],
      total: 1,
    });
    expect(mockList).toHaveBeenCalledWith(2, 10, 'أحمد');
    expect(mockSyncAdminAllowlistMirror).toHaveBeenCalledWith(['admin@example.com']);
  });

  it('returns a readable 500 on a genuine failure', async () => {
    mockList.mockRejectedValue(new Error('db down'));

    const result = await listCertificates(1, 20, '');

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.' },
    });
  });
});

describe('getCertificateById', () => {
  it('returns 401 when signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await getCertificateById('cert-1');

    expect(result).toMatchObject({ status: 401 });
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await getCertificateById('cert-1');

    expect(result).toMatchObject({ status: 403 });
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it('returns the certificate for an admin', async () => {
    const result = await getCertificateById('cert-1');

    expect(result).toMatchObject({ status: 200, body: CERTIFICATE });
  });

  it('returns null for a missing certificate instead of a rejection', async () => {
    mockGetById.mockResolvedValue(null);

    const result = await getCertificateById('missing');

    expect(result).toMatchObject({ status: 200, body: null });
  });

  it('returns a readable 500 on a genuine failure', async () => {
    mockGetById.mockRejectedValue(new Error('db down'));

    const result = await getCertificateById('cert-1');

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.' },
    });
  });
});

describe('createCertificate', () => {
  it('returns 401 when signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await createCertificate({ formData: FORM_DATA });

    expect(result).toMatchObject({ status: 401 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await createCertificate({ formData: FORM_DATA });

    expect(result).toMatchObject({ status: 403 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('created the certificate as the admin and returns the frozen payload', async () => {
    const result = await createCertificate({
      formData: FORM_DATA,
      customCode: 'COMP-2026-ABCDEFGH',
    });

    expect(result).toMatchObject({ status: 200, body: { success: true, data: CERTIFICATE } });
    expect(mockCreate).toHaveBeenCalledWith(FORM_DATA, 'COMP-2026-ABCDEFGH', 'admin-1');
  });

  it('maps a validation error to 400 with field errors', async () => {
    mockCreate.mockRejectedValue(
      new CertificateValidationError({ student_name: 'اسم الطالب قصير جداً' })
    );

    const result = await createCertificate({ formData: FORM_DATA });

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, fieldErrors: { student_name: 'اسم الطالب قصير جداً' } },
    });
  });

  it('maps a code-format error to 400', async () => {
    mockCreate.mockRejectedValue(new CertificateCodeFormatError());

    const result = await createCertificate({ formData: FORM_DATA });

    expect(result).toMatchObject({ status: 400, body: { success: false } });
  });

  it('maps a duplicate code to 409', async () => {
    mockCreate.mockRejectedValue(new CertificateDuplicateCodeError());

    const result = await createCertificate({ formData: FORM_DATA });

    expect(result).toMatchObject({ status: 409, body: { success: false } });
  });

  it('returns the operation-specific 500 on a genuine failure', async () => {
    mockCreate.mockRejectedValue(new Error('db down'));

    const result = await createCertificate({ formData: FORM_DATA });

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'حدث خطأ أثناء إنشاء الشهادة' },
    });
  });
});

describe('updateCertificate', () => {
  it('returns 401 when signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await updateCertificate('cert-1', FORM_DATA);

    expect(result).toMatchObject({ status: 401 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await updateCertificate('cert-1', FORM_DATA);

    expect(result).toMatchObject({ status: 403 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns the frozen success payload for an admin', async () => {
    const result = await updateCertificate('cert-1', FORM_DATA);

    expect(result).toMatchObject({ status: 200, body: { success: true, data: CERTIFICATE } });
    expect(mockUpdate).toHaveBeenCalledWith('cert-1', FORM_DATA);
  });

  it('maps a validation error to 400 with field errors', async () => {
    mockUpdate.mockRejectedValue(
      new CertificateValidationError({ course_name: 'اسم الدورة قصير جداً' })
    );

    const result = await updateCertificate('cert-1', FORM_DATA);

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, fieldErrors: { course_name: 'اسم الدورة قصير جداً' } },
    });
  });

  it('returns the operation-specific 500 on a genuine failure', async () => {
    mockUpdate.mockRejectedValue(new Error('db down'));

    const result = await updateCertificate('cert-1', FORM_DATA);

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'حدث خطأ أثناء تحديث الشهادة' },
    });
  });
});

describe('deleteCertificate', () => {
  it('returns 401 when signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await deleteCertificate('cert-1');

    expect(result).toMatchObject({ status: 401 });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await deleteCertificate('cert-1');

    expect(result).toMatchObject({ status: 403 });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns the frozen success payload for an admin', async () => {
    const result = await deleteCertificate('cert-1');

    expect(result).toMatchObject({ status: 200, body: { success: true } });
    expect(mockDelete).toHaveBeenCalledWith('cert-1');
  });

  it('returns the operation-specific 500 on a genuine failure', async () => {
    mockDelete.mockRejectedValue(new Error('db down'));

    const result = await deleteCertificate('cert-1');

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'حدث خطأ أثناء حذف الشهادة' },
    });
  });
});

describe('verifyCertificate', () => {
  it('answers 200 with the verification body and never requires a session', async () => {
    const result = await verifyCertificate('COMP-2026-ABCDEFGH', '1.1.1.1');

    expect(result).toMatchObject({ status: 200, body: { success: true } });
    expect(mockVerify).toHaveBeenCalledWith('COMP-2026-ABCDEFGH', '1.1.1.1');
    expect(mockGetAuthUser).not.toHaveBeenCalled();
  });

  it('answers 200 with a failure body when verification throws', async () => {
    mockVerify.mockRejectedValue(new Error('boom'));

    const result = await verifyCertificate('COMP-2026-ABCDEFGH', '1.1.1.1');

    expect(result).toMatchObject({ status: 200, body: { success: false } });
  });
});
