import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpUserContext } from '../session';

const adminCtx: McpUserContext = {
  userId: 'u1',
  email: 'admin@example.com',
  isAdmin: true,
  scopes: ['certificates.write', 'admin'],
  clientId: null,
  tokenExpiresAt: null,
  supabase: {} as never,
};

const nonAdminCtx: McpUserContext = {
  userId: 'u2',
  email: 'user@example.com',
  isAdmin: false,
  scopes: ['certificates.write'],
  clientId: null,
  tokenExpiresAt: null,
  supabase: {} as never,
};

const noScopeCtx: McpUserContext = { ...adminCtx, scopes: [] };

const repoPath = '@/backend/repositories/certificates';
const servicePath = '@/backend/services/certificates/certificates-service';

const sampleCertificate = {
  id: 'c1',
  certificate_code: 'COMP-2026-A1B2C3D4',
  student_name: 'أحمد',
  course_name: 'برمجة الويب',
  issue_date: '2026-01-01',
  expiration_date: null,
  grade_or_status: 'ممتاز',
  recipient_email: null,
  recipient_user_ids: [],
  created_at: '2026-01-01T00:00:00.000Z',
};

function mockService() {
  const create = vi.fn().mockResolvedValue(sampleCertificate);
  const update = vi.fn().mockResolvedValue({ ...sampleCertificate, student_name: 'مريم' });
  const del = vi.fn().mockResolvedValue(undefined);
  const list = vi.fn().mockResolvedValue({ data: [sampleCertificate], total: 1 });
  const getById = vi.fn().mockResolvedValue(sampleCertificate);

  vi.doMock(repoPath, () => ({ createCertificatesRepository: vi.fn() }));
  vi.doMock(servicePath, () => ({
    CertificatesService: class {
      create = create;
      update = update;
      delete = del;
      list = list;
      getById = getById;
    },
  }));

  return { create, update, delete: del, list, getById };
}

describe('admin certificate tools', () => {
  beforeEach(() => vi.resetModules());

  it('createCertificateHandler requires certificates.write scope', async () => {
    const { createCertificateHandler } = await import('../tools/certificates');
    const result = await createCertificateHandler(
      {
        student_name: 'أحمد',
        course_name: 'برمجة الويب',
        issue_date: '2026-01-01',
        format: 'json',
      },
      noScopeCtx
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('requires the scope');
  });

  it('createCertificateHandler rejects non-admin users even with the scope', async () => {
    const { createCertificateHandler } = await import('../tools/certificates');
    const result = await createCertificateHandler(
      {
        student_name: 'أحمد',
        course_name: 'برمجة الويب',
        issue_date: '2026-01-01',
        format: 'json',
      },
      nonAdminCtx
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('requires the scope');
  });

  it('createCertificateHandler issues via the service for admins', async () => {
    const { create } = mockService();
    const { createCertificateHandler } = await import('../tools/certificates');
    const result = await createCertificateHandler(
      {
        student_name: 'أحمد',
        course_name: 'برمجة الويب',
        issue_date: '2026-01-01',
        format: 'json',
      },
      adminCtx
    );
    expect(result.isError).toBeFalsy();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        student_name: 'أحمد',
        course_name: 'برمجة الويب',
        recipient_user_ids: [],
      }),
      undefined
    );
    expect(result.structuredContent?.certificate_code).toBe('COMP-2026-A1B2C3D4');
  });

  it('updateCertificateHandler merges partial fields', async () => {
    const { update, getById } = mockService();
    const { updateCertificateHandler } = await import('../tools/certificates');
    const result = await updateCertificateHandler(
      { id: 'c1', student_name: 'مريم', format: 'json' },
      adminCtx
    );
    expect(result.isError).toBeFalsy();
    expect(getById).toHaveBeenCalledWith('c1');
    expect(update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ student_name: 'مريم', course_name: 'برمجة الويب' })
    );
    expect(result.structuredContent?.message).toContain('updated');
  });

  it('updateCertificateHandler reports a missing certificate', async () => {
    vi.doMock(repoPath, () => ({ createCertificatesRepository: vi.fn() }));
    vi.doMock(servicePath, () => ({
      CertificatesService: class {
        getById = vi.fn().mockResolvedValue(null);
      },
    }));

    const { updateCertificateHandler } = await import('../tools/certificates');
    const result = await updateCertificateHandler({ id: 'missing', format: 'json' }, adminCtx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('No certificate found');
  });

  it('deleteCertificateHandler deletes for admins', async () => {
    const { delete: del } = mockService();
    const { deleteCertificateHandler } = await import('../tools/certificates');
    const result = await deleteCertificateHandler({ id: 'c1', format: 'json' }, adminCtx);
    expect(result.isError).toBeFalsy();
    expect(del).toHaveBeenCalledWith('c1');
    expect(result.structuredContent?.message).toContain('deleted');
  });

  it('listCertificatesHandler lists with pagination', async () => {
    mockService();
    const { listCertificatesHandler } = await import('../tools/certificates');
    const result = await listCertificatesHandler(
      { page: 1, page_size: 20, format: 'json' },
      adminCtx
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.meta).toMatchObject({ page: 1, page_size: 20, total: 1 });
    expect(result.structuredContent?.certificates).toHaveLength(1);
  });

  it('getCertificateHandler returns the public shape', async () => {
    mockService();
    const { getCertificateHandler } = await import('../tools/certificates');
    const result = await getCertificateHandler({ id: 'c1', format: 'json' }, adminCtx);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.certificate_code).toBe('COMP-2026-A1B2C3D4');
    expect(result.structuredContent?.recipient_email).toBeUndefined();
  });

  it('getCertificateHandler reports a missing certificate', async () => {
    vi.doMock(repoPath, () => ({ createCertificatesRepository: vi.fn() }));
    vi.doMock(servicePath, () => ({
      CertificatesService: class {
        getById = vi.fn().mockResolvedValue(null);
      },
    }));

    const { getCertificateHandler } = await import('../tools/certificates');
    const result = await getCertificateHandler({ id: 'missing', format: 'json' }, adminCtx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('No certificate found');
  });

  it('admin tools require an admin in effectiveScopes', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    const { effectiveScopes } = await import('../scope');
    expect(effectiveScopes('user@example.com', ['certificates.write', 'blog.read'])).toEqual([
      'blog.read',
    ]);
    expect(
      effectiveScopes('admin@example.com', ['certificates.write', 'admin', 'blog.read'])
    ).toEqual(['certificates.write', 'admin', 'blog.read']);
    vi.unstubAllEnvs();
  });
});
